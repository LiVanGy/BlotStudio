param(
    [Parameter(Mandatory=$true)][int]$AppProcessId,
    [ValidateSet('stock','fixture')][string]$Mode
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Chrome_WidgetWin_1'
)
$deadline = [DateTime]::UtcNow.AddSeconds(65)
$seen = ''
do {
    $proc = Get-Process -Id $AppProcessId
    if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
        $window = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
        $views = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
        foreach ($view in $views) {
            $seen = $view.Current.Name
            if (($Mode -eq 'stock' -and $seen -like 'BlotStudio*') -or ($Mode -eq 'fixture' -and $seen -like 'BLOTQA_RESULT *')) {
                $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
                $hostProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$AppProcessId"
                $owner = Invoke-CimMethod -InputObject $hostProcess -MethodName GetOwnerSid
                if ($owner.Sid -ne $identity) { throw 'The native app and UI controller must run as the same user.' }
                Write-Output "Same-user native UIA, machine $env:PROCESSOR_ARCHITECTURE, mode $Mode"
                Write-Output $seen
                exit 0
            }
        }
    }
    Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
throw "Timed out observing the native WebView title (mode $Mode, last seen '$seen')."
