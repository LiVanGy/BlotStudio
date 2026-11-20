param(
    [Parameter(Mandatory=$true)][int]$AppProcessId,
    [ValidateSet('save','overwrite','open','folder','cancel')][string]$Action,
    [string]$TargetPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class BlotDialog {
    public delegate bool EnumProc(IntPtr window, IntPtr state);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr state);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr state);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flag);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr window);
    [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr window);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder value, int size);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder value, int size);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr window, uint msg, IntPtr wParam, string lParam);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint msg, IntPtr wParam, IntPtr lParam);
    public static string Class(IntPtr w) { var s=new StringBuilder(256); GetClassName(w,s,s.Capacity); return s.ToString(); }
    public static string Title(IntPtr w) { var s=new StringBuilder(256); GetWindowText(w,s,s.Capacity); return s.ToString(); }
    public static IntPtr[] Dialogs(int[] pids, IntPtr main) {
        var list=new List<IntPtr>();
        EnumWindows((w,s)=>{ uint pid; GetWindowThreadProcessId(w,out pid);
            if(IsWindowVisible(w) && IsWindowEnabled(w) && Class(w)=="#32770" &&
                (Array.IndexOf(pids,(int)pid)>=0 || GetAncestor(w,3)==main)) list.Add(w);
            return true; },IntPtr.Zero);
        return list.ToArray();
    }
    public static IntPtr[] Controls(IntPtr parent) {
        var list=new List<IntPtr>();
        EnumChildWindows(parent,(w,s)=>{ list.Add(w); return true; },IntPtr.Zero);
        return list.ToArray();
    }
}
'@
$main = (Get-Process -Id $AppProcessId).MainWindowHandle
$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId
$ids = @($AppProcessId)
do {
    $added = @($all | Where-Object { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId } | ForEach-Object { [int]$_.ProcessId })
    $ids += $added
} while ($added.Count)
$seen = ''
function Wait-Dialog([int]$ButtonId) {
    $until = [DateTime]::UtcNow.AddSeconds(15)
    do {
        foreach ($dialog in [BlotDialog]::Dialogs([int[]]$ids,$main)) {
            $root = [System.Windows.Automation.AutomationElement]::FromHandle($dialog)
            $id = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, [string]$ButtonId)
            $button = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $id)
            $script:seen = [BlotDialog]::Title($dialog) + ' ' + (([BlotDialog]::Controls($dialog) | ForEach-Object { [BlotDialog]::Class($_) + ':' + [BlotDialog]::GetDlgCtrlID($_) }) -join ',')
            if ($button) { return [PSCustomObject]@{ Window=$dialog; Button=$button } }
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $until)
    throw "Dialog for button $ButtonId unavailable; last observed: $script:seen"
}
function Press-Button($record,[int]$id) {
    $hwnd = [IntPtr]$record.Button.Current.NativeWindowHandle
    Write-Output ("Select {0} in {1}" -f $id,[BlotDialog]::Title($record.Window))
    if (-not [BlotDialog]::PostMessage($record.Window,273,[IntPtr]$id,$hwnd)) { throw "Cannot activate dialog button $id" }
    if ($id -eq 2) {
        Start-Sleep -Milliseconds 400
        if ([BlotDialog]::IsWindowVisible($record.Window)) {
            [void][BlotDialog]::PostMessage($record.Window,16,[IntPtr]::Zero,[IntPtr]::Zero)
        }
    }
}
if ($Action -eq 'cancel') {
    $record = Wait-Dialog 2
    Press-Button $record 2
    return
}
$record = Wait-Dialog 1
$edit = [IntPtr]::Zero
foreach ($control in [BlotDialog]::Controls($record.Window)) {
    if ([BlotDialog]::Class($control) -ne 'Edit' -or -not [BlotDialog]::IsWindowVisible($control)) { continue }
    # Explorer's DirectUI file-name ComboBox has edit ID 1001. The address bar uses 41477.
    if ([BlotDialog]::GetDlgCtrlID($control) -eq 1001 -and [BlotDialog]::Class([BlotDialog]::GetParent($control)) -eq 'ComboBox') { $edit=$control; break }
    $owner = $control
    while ($owner -ne [IntPtr]::Zero -and $owner -ne $record.Window) {
        if ([BlotDialog]::GetDlgCtrlID($owner) -in @(1148,1152)) { $edit=$control; break }
        $owner = [BlotDialog]::GetParent($owner)
    }
    if ($edit -ne [IntPtr]::Zero) { break }
}
if ($edit -eq [IntPtr]::Zero) { throw "File name field unavailable: $script:seen" }
[void][BlotDialog]::SendMessage($edit,12,[IntPtr]::Zero,$TargetPath)
Press-Button $record 1
if ($Action -eq 'overwrite') {
    $confirm = Wait-Dialog 6
    Press-Button $confirm 6
}
