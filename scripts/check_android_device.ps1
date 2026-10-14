# Read-only diagnostics by default. -Install explicitly opts into adb install -r.
# No uninstall, no data clear, no automatic log upload, no permissions changed.
param(
  [string]$Apk = "android/app/build/outputs/apk/debug/app-debug.apk",
  [switch]$Install,
  [switch]$Logs
)
$ErrorActionPreference = "Stop"
$package = "com.karislin.mahjong"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  throw "adb 未安装或不在 PATH。请安装 Android SDK Platform-Tools，并开启 USB 调试。"
}
$online = @((& adb devices -l) | Where-Object { $_ -match '^\S+\s+device(?:\s|$)' })
if ($online.Count -ne 1) {
  & adb devices -l
  throw "需要恰好一台已授权且处于 device 状态的设备；当前：$($online.Count)。"
}
$serial = ($online[0] -split '\s+')[0]
Write-Host "=== Device $serial ==="
& adb -s $serial shell getprop ro.product.manufacturer
& adb -s $serial shell getprop ro.product.model
Write-Host "Android API:"
& adb -s $serial shell getprop ro.build.version.sdk
& adb -s $serial shell wm size
& adb -s $serial shell wm density

$apkPath = if ([System.IO.Path]::IsPathRooted($Apk)) { $Apk } else { Join-Path $root $Apk }
if (Test-Path -LiteralPath $apkPath -PathType Leaf) {
  $apkPath = (Resolve-Path -LiteralPath $apkPath).Path
  Write-Host "=== Local APK ==="
  $info = Get-Item -LiteralPath $apkPath
  Write-Host ("Path: " + $apkPath)
  Write-Host ("Size: " + [math]::Round($info.Length / 1MB, 2) + " MiB")
  Write-Host ("SHA256: " + (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
  try {
    $paths = @($archive.Entries | ForEach-Object { $_.FullName })
    $model = $paths -contains "assets/mahjong_detector.onnx"
    $manifest = $paths -contains "assets/mahjong_detector.json"
    Write-Host "Contains local ONNX: $model ; model manifest: $manifest"
    if ($model -xor $manifest) { throw "模型和清单必须成对存在；此 APK 无法正确加载。" }
    if ($model -and $manifest) {
      $manifestEntry = $archive.GetEntry("assets/mahjong_detector.json")
      $reader = [System.IO.StreamReader]::new($manifestEntry.Open(), [System.Text.Encoding]::UTF8)
      try { $metadata = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
      $hasher = [System.Security.Cryptography.SHA256]::Create()
      $modelStream = $archive.GetEntry("assets/mahjong_detector.onnx").Open()
      try {
        $actualHash = [System.BitConverter]::ToString($hasher.ComputeHash($modelStream)).Replace("-", "").ToLowerInvariant()
      } finally {
        $modelStream.Dispose()
        $hasher.Dispose()
      }
      if ($actualHash -ne $metadata.model_sha256) {
        throw "APK 内 ONNX 的 SHA-256 不匹配 manifest，拒绝安装/验收。"
      }
      if (@($metadata.classes).Count -ne 37) { throw "APK 内模型类别数与 37 类约定不符。" }
      Write-Host "Embedded ONNX SHA-256 verified: $actualHash ; classes: 37"
    }
  } finally { $archive.Dispose() }
  if ($Install) {
    Write-Host "=== adb install -r (保留现有应用数据) ==="
    & adb -s $serial install -r $apkPath
    if ($LASTEXITCODE -ne 0) {
      throw "覆盖安装失败。若为 INSTALL_FAILED_UPDATE_INCOMPATIBLE，请核对签名；不要为了安装直接卸载旧版。"
    }
  }
} else {
  if ($Install) { throw "未找到 APK：$apkPath；请先构建。" }
  Write-Warning "本地未找到 APK：$apkPath，仅收集设备信息。"
}
Write-Host "=== Installed app (if present) ==="
$pkg = @(& adb -s $serial shell dumpsys package $package)
$pkg | Select-String -Pattern "versionCode=|versionName=" | Select-Object -First 4
Write-Host "=== Human device checks (NOT automated/passed) ==="
Write-Host "启动应用 → 手动13/14张出牌建议 → 游戏截图纠错/撤销 → 相册 YOLO 状态和图片 → 离线重启/旋转/切模式。"
Write-Host "MediaProjection 悬浮窗目前尚未实现；不能将本命令结果当作该功能的验收。"
if ($Logs) {
  Write-Host "=== Recent AndroidRuntime/Capacitor logs (may contain private information; review before sharing) ==="
  & adb -s $serial logcat -d -t 100 -s AndroidRuntime:E Capacitor:D
}
