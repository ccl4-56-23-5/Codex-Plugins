param([Parameter(Mandatory=$true)][string]$Message)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DshDesktopInput {
 [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public U U; }
 [StructLayout(LayoutKind.Explicit, Size=32)] public struct U { [FieldOffset(0)] public KI ki; }
 [StructLayout(LayoutKind.Sequential)] public struct KI { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
 [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, INPUT[] a, int cb);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 public static void Text(string s) {
  foreach(char c in s) {
   var a=new INPUT[2]; a[0].type=1; a[0].U.ki.scan=c; a[0].U.ki.flags=4;
   a[1].type=1; a[1].U.ki.scan=c; a[1].U.ki.flags=6;
   if(SendInput(2,a,Marshal.SizeOf<INPUT>())!=2) throw new Exception("SendInput failed: " + Marshal.GetLastWin32Error());
  }
 }
}
'@
$store = Join-Path $env:USERPROFILE '.dsh\storages\workspace.json'
$data = Get-Content -LiteralPath $store -Raw -Encoding UTF8 | ConvertFrom-Json
$workspaceId = $data.global.defaultWorkspaceId
$workspace = $data.tables.workspaces.PSObject.Properties[$workspaceId].Value
if (-not $workspace -or -not (Test-Path -LiteralPath $workspace.path -PathType Container)) { throw 'DSH default workspace is unavailable' }
$workspaceName = '默认工作区'
function Window {
 $p = Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
 if ($p) { return [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle) }
 return $null
}
function Find($root, $name, $controlType) {
 if (-not $root) { return @() }
 $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
 $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
 $result = @()
 foreach ($e in $all) { if (-not $controlType -or $e.Current.ControlType.ProgrammaticName -eq "ControlType.$controlType") { $result += $e } }
 return $result
}
function WaitFor($name, $controlType, $seconds) {
 $deadline = (Get-Date).AddSeconds($seconds)
 while ((Get-Date) -lt $deadline) {
  $found = @(Find (Window) $name $controlType)
  if ($found.Count) { return $found[0] }
  Start-Sleep -Milliseconds 250
 }
 throw "DSH desktop control not found: $name ($controlType)"
}
function Invoke($element) { $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
if (-not (Window)) {
 $exe = if ($env:DSH_DESKTOP_EXE) { $env:DSH_DESKTOP_EXE } else { 'D:\DeepSeekHarness\DeepSeek Harness.exe' }
 if (-not (Test-Path -LiteralPath $exe)) { throw "DSH Desktop not found: $exe" }
 Start-Process -FilePath $exe | Out-Null
}
$null = WaitFor '新建会话' 'Button' 30
$buttons = @(Find (Window) '新建会话' 'Button')
$newButton = $buttons | Where-Object { $_.Current.BoundingRectangle.Width -gt 150 } | Select-Object -First 1
if (-not $newButton) { $newButton = $buttons[0] }
Invoke $newButton
$selector = WaitFor '选择工作区' 'Button' 15
$selector.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()
$choice = WaitFor $workspaceName 'MenuItem' 10
Invoke $choice
$deadline = (Get-Date).AddSeconds(15)
$composer = $null
while ((Get-Date) -lt $deadline) {
 $all = (Window).FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
 foreach ($e in $all) {
  if ($e.Current.ControlType.ProgrammaticName -eq 'ControlType.Edit' -and $e.Current.Name -like '描述你想要构建的内容*') { $composer = $e; break }
 }
 if ($composer) { break }
 Start-Sleep -Milliseconds 250
}
if (-not $composer) { throw 'DSH composer not found' }
$process = Get-Process 'DeepSeek Harness' | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
[DshDesktopInput]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
$focused = $false
for ($attempt = 0; $attempt -lt 8; $attempt++) {
 try {
  $all = (Window).FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $composer = $null
  foreach ($e in $all) { if ($e.Current.ControlType.ProgrammaticName -eq 'ControlType.Edit' -and $e.Current.Name -like '描述你想要构建的内容*') { $composer = $e; break } }
  if ($composer) { $composer.SetFocus(); $focused = $true; break }
 } catch [System.Windows.Automation.ElementNotAvailableException] { }
 Start-Sleep -Milliseconds 300
}
if (-not $focused) { throw 'DSH composer became unavailable' }
[DshDesktopInput]::Text($Message)
$send = WaitFor '发送消息' 'Button' 10
if (-not $send.Current.IsEnabled) { throw 'DSH send button did not become enabled after typing' }
Invoke $send
$deadline = (Get-Date).AddSeconds(30)
$visible = $false
while ((Get-Date) -lt $deadline) {
 if (@(Find (Window) $Message 'Text').Count -gt 0) { $visible = $true; break }
 Start-Sleep -Milliseconds 300
}
if (-not $visible) { throw 'Message was sent but did not become visible in DSH Desktop' }
$root = Window
[pscustomobject]@{ sent = $true; visibleInDesktop = $true; workspace = $workspaceName; workspacePath = $workspace.path; message = $Message; windowTitle = $root.Current.Name } | ConvertTo-Json -Compress
