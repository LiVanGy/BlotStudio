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
            if (!$button -and $ButtonId -eq 6 -and [BlotDialog]::Title($dialog) -eq 'Confirm Save As') {
                $yes = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Yes')
                $button = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $yes)
            }
            $script:seen = [BlotDialog]::Title($dialog) + ' ' + (([BlotDialog]::Controls($dialog) | ForEach-Object { [BlotDialog]::Class($_) + ':' + [BlotDialog]::GetDlgCtrlID($_) }) -join ',')
            if ($button) { return [PSCustomObject]@{ Window=$dialog; Button=$button } }
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $until)
    throw "Dialog for button $ButtonId unavailable; last observed: $script:seen"
}
function Press-Button($record,[int]$id) {
    $nativeHandle = $record.Button.Current.NativeWindowHandle
    $hwnd = [IntPtr]::Zero
    if ($nativeHandle) { $hwnd = [IntPtr]$nativeHandle }
    Write-Output ("Select {0} in {1}" -f $id,[BlotDialog]::Title($record.Window))
    if ($id -eq 6) {
        # Confirm Save As is a TaskDialog with windowless CCPushButton elements.
        # TDM_CLICK_BUTTON delivers IDYES to the native task-dialog callback.
        [void][BlotDialog]::PostMessage($record.Window,(0x400 + 102),[IntPtr]6,[IntPtr]::Zero)
        Start-Sleep -Milliseconds 400
        if ([BlotDialog]::IsWindowVisible($record.Window)) {
            [void][BlotDialog]::PostMessage($record.Window,273,[IntPtr]6,$hwnd)
            Start-Sleep -Milliseconds 400
        }
        if ([BlotDialog]::IsWindowVisible($record.Window)) {
            throw 'The named overwrite confirmation remained open after activating Yes.'
        }
        return
    }
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
if ($TargetPath -and $Action -in @('open', 'folder')) {
    $leaf = [IO.Path]::GetFileName($TargetPath)
    $names = @($leaf, [IO.Path]::GetFileNameWithoutExtension($leaf))
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($record.Window)
    $stop = [DateTime]::UtcNow.AddSeconds(6)
    $lastNames = @()
    $navigated = $false
    do {
        $items = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        $selected = $false
        $lastNames = @()
        foreach ($item in $items) {
            if ($item.Current.ControlType -notin @([System.Windows.Automation.ControlType]::ListItem,[System.Windows.Automation.ControlType]::DataItem)) { continue }
            $lastNames += $item.Current.Name
            if ($item.Current.Name -notin $names) { continue }
            $pattern = $null
            if (!$item.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$pattern)) { continue }
            $pattern.Select()
            if (-not $pattern.Current.IsSelected) { throw "Shell item was not selected: $leaf" }
            Write-Output "Selected shell item: $($item.Current.Name)"
            $selected = $true
            break
        }
        if (!$selected -and !$navigated -and $Action -eq 'open') {
            $folderName = [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($TargetPath))
            foreach ($item in $items) {
                $type = $item.Current.ControlType
                if ($type -notin @([System.Windows.Automation.ControlType]::ListItem,[System.Windows.Automation.ControlType]::DataItem) -or $item.Current.Name -ne $folderName) { continue }
                $pattern = $null
                if ($item.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$pattern)) {
                    $pattern.Select()
                    $navigated = $true
                    if (!$pattern.Current.IsSelected) { throw "Directory entry was not selected: $folderName" }
                    Write-Output "Open selected shell directory: $folderName"
                    Press-Button $record 1
                    Start-Sleep -Milliseconds 300
                    break
                }
            }
        }
        if (!$selected) { Start-Sleep -Milliseconds 120 }
    } while (!$selected -and [DateTime]::UtcNow -lt $stop)
    if (!$selected) { throw "Shell item unavailable: $leaf; observed: $($lastNames -join ', ')" }
    # Navigating folders reconstructs the picker buttons.
    $record = Wait-Dialog 1
}
Press-Button $record 1
if ($Action -eq 'overwrite') {
    $confirm = Wait-Dialog 6
    Press-Button $confirm 6
}
