using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json;

namespace BlotStudio;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainWindow());
    }
}

internal sealed class MainWindow : Form
{
    private const string DocumentUrl = "https://blotstudio.local/BlotStudio.html";
    private readonly WebView2 web = new() { Dock = DockStyle.Fill };
    private bool saving, closing, canClose, ready;

    public MainWindow()
    {
        Text = "BlotStudio · 免费 WB 工作台";
        Width = 1440; Height = 930;
        MinimumSize = new Size(800, 600);
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(web);
        Shown += async (_, _) => await InitializeAsync();
        FormClosing += ClosingAsync;
    }

    private static bool AllowsDocument(string url)
    {
        return Uri.TryCreate(url, UriKind.Absolute, out var uri)
            && uri.GetLeftPart(UriPartial.Path) == DocumentUrl
            && string.IsNullOrEmpty(uri.Query)
            && string.IsNullOrEmpty(uri.UserInfo);
    }

    private async Task InitializeAsync()
    {
        try
        {
            var folder = Path.Combine(AppContext.BaseDirectory, "www");
            if (!File.Exists(Path.Combine(folder, "BlotStudio.html")))
                throw new IOException("找不到离线页面，请完整解压安装包后重试。");
            var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BlotStudio", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(null, userData);
            await web.EnsureCoreWebView2Async(environment);
            var core = web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping("blotstudio.local", folder, CoreWebView2HostResourceAccessKind.DenyCors);
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsStatusBarEnabled = false;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.NavigationStarting += (_, e) => { if (!AllowsDocument(e.Uri)) e.Cancel = true; };
            core.FrameNavigationStarting += (_, e) => e.Cancel = true;
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.DownloadStarting += (_, e) => e.Cancel = true;
            core.WebMessageReceived += SaveRequestedAsync;
            core.NavigationCompleted += (_, e) => ready = e.IsSuccess;
            // Local application assets only. The HTML is self-contained, so no remote requests are needed.
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, e) =>
            {
                if (!AllowsDocument(e.Request.Uri) && !e.Request.Uri.StartsWith("data:") && !e.Request.Uri.StartsWith("blob:https://blotstudio.local/"))
                    e.Response = core.Environment.CreateWebResourceResponse(null, 403, "Blocked", "");
            };
            core.Navigate(DocumentUrl);
        }
        catch (Exception error)
        {
            MessageBox.Show(this, "无法启动 Windows 窗口。请检查是否安装 Microsoft Edge WebView2 Runtime。\n可使用同一发布页的 Web 离线版继续工作。\n\n" + error.Message,
                "BlotStudio 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            canClose = true; Close();
        }
    }

    private Task ReplyAsync(string id, string status, string message = "")
    {
        var args = JsonSerializer.Serialize(new[] { id, status, message });
        return web.CoreWebView2.ExecuteScriptAsync("globalThis.BS?.nativeSaveResult?.(..." + args + ");");
    }

    private async void SaveRequestedAsync(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!AllowsDocument(e.Source)) return;
        string? id = null;
        bool ownsSave = false;
        string? tempFile = null;
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            var body = document.RootElement;
            if (body.GetProperty("type").GetString() != "saveFile") return;
            id = body.GetProperty("id").GetString();
            if (string.IsNullOrEmpty(id) || id.Length > 200) return;
            if (saving || closing) { await ReplyAsync(id, "error", "请先完成当前对话框。"); return; }
            saving = true; ownsSave = true;
            var name = Path.GetFileName(body.GetProperty("name").GetString());
            if (string.IsNullOrWhiteSpace(name)) throw new IOException("导出文件名无效。");
            var bytes = Convert.FromBase64String(body.GetProperty("data").GetString() ?? "");
            using var dialog = new SaveFileDialog { FileName = name, OverwritePrompt = true, AddExtension = false, RestoreDirectory = true, Filter = "All files (*.*)|*.*" };
            if (dialog.ShowDialog(this) != DialogResult.OK) { await ReplyAsync(id, "cancelled"); return; }
            var target = Path.GetFullPath(dialog.FileName);
            tempFile = Path.Combine(Path.GetDirectoryName(target)!, ".blotstudio-" + Guid.NewGuid().ToString("N") + ".tmp");
            await File.WriteAllBytesAsync(tempFile, bytes);
            if (File.Exists(target)) File.Replace(tempFile, target, null);
            else File.Move(tempFile, target);
            tempFile = null;
            await ReplyAsync(id, "saved");
        }
        catch (Exception error)
        {
            if (id is not null) { try { await ReplyAsync(id, "error", error.Message); } catch { } }
        }
        finally
        {
            if (tempFile is not null) { try { File.Delete(tempFile); } catch { } }
            if (ownsSave) saving = false;
        }
    }

    private async void ClosingAsync(object? sender, FormClosingEventArgs e)
    {
        if (canClose) return;
        e.Cancel = true;
        if (saving || closing) return;
        closing = true;
        try
        {
            if (!ready) throw new IOException("页面尚未加载完成，未确认本地保存。");
            // ExecuteScriptAsync does not await promises; use a token-specific completion message.
            var token = Guid.NewGuid().ToString("N");
            var completion = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            void Flushed(object? _, CoreWebView2WebMessageReceivedEventArgs message)
            {
                if (!AllowsDocument(message.Source)) return;
                try
                {
                    using var doc = JsonDocument.Parse(message.WebMessageAsJson);
                    var root = doc.RootElement;
                    if (root.GetProperty("type").GetString() == "flush" && root.GetProperty("token").GetString() == token)
                        completion.TrySetResult(root.GetProperty("ok").GetBoolean());
                }
                catch { }
            }
            web.CoreWebView2.WebMessageReceived += Flushed;
            try
            {
                var script = "(async()=>{let ok=false;try{document.activeElement?.blur();document.body.inert=true;await BS.ready;ok=(await BS.flushSave())===true;}catch{}chrome.webview.postMessage({type:'flush',token:"
                    + JsonSerializer.Serialize(token) + ",ok});})();";
                await web.CoreWebView2.ExecuteScriptAsync(script);
                if (!await completion.Task.WaitAsync(TimeSpan.FromSeconds(12))) throw new IOException("本地保存未返回成功确认。");
            }
            finally { web.CoreWebView2.WebMessageReceived -= Flushed; }
            canClose = true;
        }
        catch (Exception error)
        {
            canClose = MessageBox.Show(this, "本地自动保存未完成。建议取消退出并用“保存项目”导出备份。\n\n" + error.Message + "\n\n仍然退出？", "BlotStudio", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
            if (!canClose && web.CoreWebView2 is not null)
                try { await web.CoreWebView2.ExecuteScriptAsync("document.body.inert=false;"); } catch { }
        }
        finally { closing = false; }
        if (canClose) Close();
    }
}
