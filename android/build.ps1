param(
    [string]$SiteUrl = 'https://gods-country.countryofgod.workers.dev/',
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$previousJava = $env:JAVA_HOME
$previousSdk = $env:ANDROID_HOME
$previousPath = $env:PATH

try {
    if (-not $env:JAVA_HOME) {
        $portableJava = Get-ChildItem -LiteralPath "$PSScriptRoot/.toolchain" -Filter java.exe -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Directory.Name -eq 'bin' } | Select-Object -First 1
        if ($portableJava) {
            $env:JAVA_HOME = $portableJava.Directory.Parent.FullName
        }
    }
    if ($env:JAVA_HOME) {
        $env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
    }
    if (-not $env:ANDROID_HOME) {
        if ($env:ANDROID_SDK_ROOT) {
            $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
        } elseif (Test-Path -LiteralPath "$PSScriptRoot/.toolchain/sdk/platforms") {
            $env:ANDROID_HOME = "$PSScriptRoot/.toolchain/sdk"
        } elseif (Test-Path -LiteralPath "$env:LOCALAPPDATA/Android/Sdk") {
            $env:ANDROID_HOME = "$env:LOCALAPPDATA/Android/Sdk"
        }
    }
    if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
        throw '请安装 JDK 17，并设置 JAVA_HOME。详见 android/README.md。'
    }
    Push-Location $PSScriptRoot
    try {
        $tasks = @('assembleDebug')
        if ($Check) {
            $tasks += @('testDebugUnitTest', 'lintDebug')
        }
        $portableGradle = "$PSScriptRoot/.toolchain/gradle-8.9/bin/gradle.bat"
        if (Test-Path -LiteralPath $portableGradle) {
            & $portableGradle @tasks "-PsiteUrl=$SiteUrl" --console=plain
        } else {
            & "$PSScriptRoot/gradlew.bat" @tasks "-PsiteUrl=$SiteUrl" --console=plain
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Android 构建失败，退出码 $LASTEXITCODE"
        }
        Write-Output "APK: $PSScriptRoot/app/build/outputs/apk/debug/app-debug.apk"
    } finally {
        Pop-Location
    }
} finally {
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousSdk
    $env:PATH = $previousPath
}
