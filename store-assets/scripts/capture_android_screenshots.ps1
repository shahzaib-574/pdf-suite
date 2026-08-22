#Requires -Version 5.1

[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\screenshots'),

    [ValidateRange(1, 6)]
    [int[]]$State = @(1, 2, 3, 4, 5, 6),

    [ValidatePattern('^[A-Za-z0-9._:-]+$')]
    [string]$Serial,

    [string]$AdbPath,

    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedWidth = 1080
$expectedHeight = 1920
$packageName = 'com.reampdf.mobile'

$captureStates = @(
    [pscustomobject]@{
        Number = 1
        FileName = '01-tools-home-1080x1920.png'
        Title = 'Tools home'
        Instructions = @(
            'Open Ream on the Tools tab.',
            'Show search, category controls, and the first useful tool cards.',
            'Dismiss notifications, dialogs, keyboards, developer overlays, and test ads.'
        )
    },
    [pscustomobject]@{
        Number = 2
        FileName = '02-scan-intake-1080x1920.png'
        Title = 'Scan intake'
        Instructions = @(
            'Open Scan and add a synthetic, non-confidential page.',
            'Return from the camera or picker so Ream is foregrounded.',
            'Show the selected page and the next create action.'
        )
    },
    [pscustomobject]@{
        Number = 3
        FileName = '03-pdf-to-word-1080x1920.png'
        Title = 'PDF to Word'
        Instructions = @(
            'Open PDF to Word and select the synthetic PDF fixture.',
            'Show the selected filename and the Convert to Word action.',
            'Do not expose a personal path, account, or provider name.'
        )
    },
    [pscustomobject]@{
        Number = 4
        FileName = '04-pdf-reader-1080x1920.png'
        Title = 'PDF reader'
        Instructions = @(
            'Open the synthetic PDF in Ream''s reader.',
            'Show readable document content, page controls, and search or outline access.',
            'Keep the reader in portrait orientation.'
        )
    },
    [pscustomobject]@{
        Number = 5
        FileName = '05-organize-pages-1080x1920.png'
        Title = 'Organize pages'
        Instructions = @(
            'Open Organize and select a synthetic PDF with several pages.',
            'Wait for real thumbnails to finish rendering.',
            'Show reorder, rotate, or remove controls without opening a system picker.'
        )
    },
    [pscustomobject]@{
        Number = 6
        FileName = '06-recents-1080x1920.png'
        Title = 'Recents'
        Instructions = @(
            'Generate synthetic PDF and DOCX outputs, then open Recents.',
            'Show usable open, save, or share actions.',
            'Check that no confidential filename or document content is visible.'
        )
    }
)

function Initialize-PngSupport {
    Add-Type -AssemblyName System.Drawing

    if ($null -ne ('ReamScreenshotPng' -as [type])) {
        return
    }

    $typeSource = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class ReamScreenshotPng
{
    public static byte[] ToOpaqueRgb(byte[] png, int expectedWidth, int expectedHeight)
    {
        if (png == null || png.Length == 0)
        {
            throw new InvalidDataException("adb returned an empty screenshot.");
        }

        using (MemoryStream input = new MemoryStream(png, false))
        using (Bitmap decoded = new Bitmap(input))
        {
            if (decoded.Width != expectedWidth || decoded.Height != expectedHeight)
            {
                throw new InvalidDataException(
                    String.Format(
                        "Screenshot is {0}x{1}; expected {2}x{3} portrait.",
                        decoded.Width,
                        decoded.Height,
                        expectedWidth,
                        expectedHeight));
            }

            Rectangle bounds = new Rectangle(0, 0, decoded.Width, decoded.Height);
            using (Bitmap rgba = decoded.Clone(bounds, PixelFormat.Format32bppArgb))
            {
                AssertFullyOpaque(rgba, bounds);

                using (Bitmap rgb = new Bitmap(decoded.Width, decoded.Height, PixelFormat.Format24bppRgb))
                {
                    CopyOpaquePixels(rgba, rgb, bounds);
                    using (MemoryStream output = new MemoryStream())
                    {
                        rgb.Save(output, ImageFormat.Png);
                        return output.ToArray();
                    }
                }
            }
        }
    }

    public static void AssertDecodable(byte[] png, int expectedWidth, int expectedHeight)
    {
        using (MemoryStream input = new MemoryStream(png, false))
        using (Bitmap decoded = new Bitmap(input))
        {
            if (decoded.Width != expectedWidth || decoded.Height != expectedHeight)
            {
                throw new InvalidDataException("Decoded PNG dimensions do not match its listing requirements.");
            }

            decoded.GetPixel(0, 0);
            decoded.GetPixel(decoded.Width - 1, decoded.Height - 1);
        }
    }

    private static void AssertFullyOpaque(Bitmap bitmap, Rectangle bounds)
    {
        BitmapData data = null;
        try
        {
            data = bitmap.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            int rowLength = Math.Abs(data.Stride);
            byte[] row = new byte[rowLength];

            for (int y = 0; y < bitmap.Height; y++)
            {
                Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), row, 0, rowLength);
                for (int x = 0; x < bitmap.Width; x++)
                {
                    if (row[(x * 4) + 3] != 255)
                    {
                        throw new InvalidDataException(
                            "The Android screenshot contains transparent pixels; capture an opaque app screen.");
                    }
                }
            }
        }
        finally
        {
            if (data != null)
            {
                bitmap.UnlockBits(data);
            }
        }
    }

    private static void CopyOpaquePixels(Bitmap source, Bitmap destination, Rectangle bounds)
    {
        BitmapData sourceData = null;
        BitmapData destinationData = null;
        try
        {
            sourceData = source.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            destinationData = destination.LockBits(bounds, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);

            int sourceRowLength = Math.Abs(sourceData.Stride);
            int destinationRowLength = Math.Abs(destinationData.Stride);
            byte[] sourceRow = new byte[sourceRowLength];
            byte[] destinationRow = new byte[destinationRowLength];

            for (int y = 0; y < source.Height; y++)
            {
                Array.Clear(destinationRow, 0, destinationRow.Length);
                Marshal.Copy(
                    IntPtr.Add(sourceData.Scan0, y * sourceData.Stride),
                    sourceRow,
                    0,
                    sourceRowLength);

                for (int x = 0; x < source.Width; x++)
                {
                    int sourceOffset = x * 4;
                    int destinationOffset = x * 3;
                    destinationRow[destinationOffset] = sourceRow[sourceOffset];
                    destinationRow[destinationOffset + 1] = sourceRow[sourceOffset + 1];
                    destinationRow[destinationOffset + 2] = sourceRow[sourceOffset + 2];
                }

                Marshal.Copy(
                    destinationRow,
                    0,
                    IntPtr.Add(destinationData.Scan0, y * destinationData.Stride),
                    destinationRowLength);
            }
        }
        finally
        {
            if (destinationData != null)
            {
                destination.UnlockBits(destinationData);
            }
            if (sourceData != null)
            {
                source.UnlockBits(sourceData);
            }
        }
    }
}
'@
    $drawingReferences = @(
        [Drawing.Bitmap].Assembly.Location
        [Drawing.Rectangle].Assembly.Location
        [AppDomain]::CurrentDomain.GetAssemblies() |
            Where-Object { $_.GetName().Name -like 'System.Private.Windows.*' } |
            ForEach-Object { $_.Location }
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique
    Add-Type -TypeDefinition $typeSource -ReferencedAssemblies $drawingReferences
}

function Read-UInt32BigEndian {
    param(
        [Parameter(Mandatory)]
        [byte[]]$Bytes,

        [Parameter(Mandatory)]
        [int]$Offset
    )

    if ($Offset -lt 0 -or ($Offset + 4) -gt $Bytes.Length) {
        throw 'PNG ended while reading a 32-bit value.'
    }

    return [uint32](
        ([uint64]$Bytes[$Offset] * [uint64]16777216) +
        ([uint64]$Bytes[$Offset + 1] * [uint64]65536) +
        ([uint64]$Bytes[$Offset + 2] * [uint64]256) +
        [uint64]$Bytes[$Offset + 3]
    )
}

function Get-PngInfo {
    param(
        [Parameter(Mandatory)]
        [byte[]]$Bytes
    )

    $signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
    if ($Bytes.Length -lt 33) {
        throw 'Screenshot is too short to be a PNG.'
    }
    for ($index = 0; $index -lt $signature.Length; $index++) {
        if ($Bytes[$index] -ne $signature[$index]) {
            throw 'Screenshot does not have a valid PNG signature.'
        }
    }

    $offset = 8
    $width = 0
    $height = 0
    $bitDepth = 0
    $colorType = -1
    $hasTransparencyChunk = $false
    $sawHeader = $false
    $sawEnd = $false

    while (($offset + 12) -le $Bytes.Length) {
        $chunkLengthValue = Read-UInt32BigEndian -Bytes $Bytes -Offset $offset
        if ($chunkLengthValue -gt [int]::MaxValue) {
            throw 'PNG contains an impossibly large chunk.'
        }
        $chunkLength = [int]$chunkLengthValue
        $nextOffset = [int64]$offset + [int64]$chunkLength + 12
        if ($nextOffset -gt $Bytes.Length) {
            throw 'PNG contains a truncated chunk.'
        }

        $chunkType = [Text.Encoding]::ASCII.GetString($Bytes, $offset + 4, 4)
        if (-not $sawHeader -and $chunkType -ne 'IHDR') {
            throw 'PNG does not start with an IHDR chunk.'
        }

        if ($chunkType -eq 'IHDR') {
            if ($sawHeader -or $chunkLength -ne 13) {
                throw 'PNG has an invalid IHDR chunk.'
            }
            $widthValue = Read-UInt32BigEndian -Bytes $Bytes -Offset ($offset + 8)
            $heightValue = Read-UInt32BigEndian -Bytes $Bytes -Offset ($offset + 12)
            if ($widthValue -gt [int]::MaxValue -or $heightValue -gt [int]::MaxValue) {
                throw 'PNG dimensions exceed the supported range.'
            }
            $width = [int]$widthValue
            $height = [int]$heightValue
            $bitDepth = [int]$Bytes[$offset + 16]
            $colorType = [int]$Bytes[$offset + 17]
            if ($Bytes[$offset + 18] -ne 0 -or $Bytes[$offset + 19] -ne 0) {
                throw 'PNG uses an unsupported compression or filter method.'
            }
            if ($Bytes[$offset + 20] -notin @(0, 1)) {
                throw 'PNG uses an unsupported interlace method.'
            }
            $sawHeader = $true
        }
        elseif ($chunkType -eq 'tRNS') {
            $hasTransparencyChunk = $true
        }
        elseif ($chunkType -eq 'IEND') {
            $sawEnd = $true
            break
        }

        $offset = [int]$nextOffset
    }

    if (-not $sawHeader -or -not $sawEnd) {
        throw 'PNG is missing a required IHDR or IEND chunk.'
    }

    return [pscustomobject]@{
        Width = $width
        Height = $height
        BitDepth = $bitDepth
        ColorType = $colorType
        HasTransparencyChunk = $hasTransparencyChunk
    }
}

function Assert-PlayScreenshotBytes {
    param(
        [Parameter(Mandatory)]
        [byte[]]$Bytes,

        [Parameter(Mandatory)]
        [string]$Label
    )

    $info = Get-PngInfo -Bytes $Bytes
    if ($info.Width -ne $expectedWidth -or $info.Height -ne $expectedHeight) {
        throw "$Label is $($info.Width)x$($info.Height); expected ${expectedWidth}x${expectedHeight}."
    }
    if ($info.BitDepth -ne 8 -or $info.ColorType -ne 2 -or $info.HasTransparencyChunk) {
        throw "$Label must be an 8-bit RGB PNG without alpha or transparency."
    }

    try {
        [ReamScreenshotPng]::AssertDecodable($Bytes, $expectedWidth, $expectedHeight)
    }
    catch {
        throw "$Label is not a decodable PNG: $($_.Exception.GetBaseException().Message)"
    }

    return $info
}

function Assert-PlayScreenshotFile {
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [pscustomobject]$CaptureState
    )

    $actualName = [IO.Path]::GetFileName($Path)
    if (-not [string]::Equals($actualName, $CaptureState.FileName, [StringComparison]::Ordinal)) {
        throw "Screenshot filename '$actualName' must be exactly '$($CaptureState.FileName)'."
    }
    if (-not [IO.File]::Exists($Path)) {
        throw "Missing screenshot: $Path"
    }

    $bytes = [IO.File]::ReadAllBytes($Path)
    return Assert-PlayScreenshotBytes -Bytes $bytes -Label $actualName
}

function Resolve-AdbExecutable {
    param([string]$RequestedPath)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        $requestedCommand = Get-Command -Name $RequestedPath -CommandType Application -ErrorAction SilentlyContinue
        if ($null -ne $requestedCommand) {
            return $requestedCommand.Source
        }
        if ([IO.File]::Exists($RequestedPath)) {
            return [IO.Path]::GetFullPath($RequestedPath)
        }
        throw "adb was not found at '$RequestedPath'."
    }

    $pathCommand = Get-Command -Name 'adb.exe' -CommandType Application -ErrorAction SilentlyContinue
    if ($null -ne $pathCommand) {
        return $pathCommand.Source
    }

    $candidates = [Collections.Generic.List[string]]::new()
    foreach ($sdkRoot in @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME)) {
        if (-not [string]::IsNullOrWhiteSpace($sdkRoot)) {
            $candidates.Add((Join-Path $sdkRoot 'platform-tools\adb.exe'))
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'))
    }

    foreach ($candidate in $candidates) {
        if ([IO.File]::Exists($candidate)) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }

    throw 'adb.exe was not found. Install Android SDK Platform-Tools or pass -AdbPath explicitly.'
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,

        [Parameter(Mandatory)]
        [string[]]$Arguments,

        [switch]$Binary,

        [int]$TimeoutMilliseconds = 30000
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $argumentListProperty = $startInfo.PSObject.Properties['ArgumentList']
    if ($null -ne $argumentListProperty) {
        foreach ($argument in $Arguments) {
            $startInfo.ArgumentList.Add($argument)
        }
    }
    else {
        foreach ($argument in $Arguments) {
            if ($argument -match '[\s"]') {
                throw "This PowerShell version cannot safely pass adb argument '$argument'."
            }
        }
        $startInfo.Arguments = $Arguments -join ' '
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $stdout = [IO.MemoryStream]::new()
    try {
        if (-not $process.Start()) {
            throw 'Could not start adb.'
        }

        $stdoutTask = $process.StandardOutput.BaseStream.CopyToAsync($stdout)
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutMilliseconds)) {
            try {
                $process.Kill()
            }
            catch {
                # The process may have exited between the timeout and Kill().
            }
            throw "adb timed out after $TimeoutMilliseconds ms."
        }

        $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult().Trim()
        if ($process.ExitCode -ne 0) {
            if ([string]::IsNullOrWhiteSpace($stderr)) {
                $stderr = 'no error details returned'
            }
            throw "adb failed with exit code $($process.ExitCode): $stderr"
        }

        $resultBytes = $stdout.ToArray()
        if ($Binary) {
            return ,$resultBytes
        }
        return [Text.Encoding]::UTF8.GetString($resultBytes).Trim()
    }
    finally {
        $stdout.Dispose()
        $process.Dispose()
    }
}

function Get-ConnectedEmulatorSerial {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,

        [string]$RequestedSerial
    )

    $deviceOutput = [string](Invoke-Adb -Executable $Executable -Arguments @('devices', '-l'))
    $devices = @(
        foreach ($line in ($deviceOutput -split "`r?`n")) {
            if ($line -match '^(?<serial>\S+)\s+(?<state>\S+)(?:\s+.*)?$' -and
                $Matches.serial -ne 'List') {
                [pscustomobject]@{
                    Serial = $Matches.serial
                    State = $Matches.state
                }
            }
        }
    )

    if (-not [string]::IsNullOrWhiteSpace($RequestedSerial)) {
        $match = @($devices | Where-Object { $_.Serial -ceq $RequestedSerial })
        if ($match.Count -ne 1) {
            throw "Device '$RequestedSerial' is not present in 'adb devices -l'."
        }
        if ($match[0].State -ne 'device') {
            throw "Device '$RequestedSerial' is $($match[0].State), not ready."
        }
        $selected = $RequestedSerial
    }
    else {
        $online = @($devices | Where-Object { $_.State -eq 'device' })
        $emulators = @(
            foreach ($device in $online) {
                $qemu = [string](Invoke-Adb -Executable $Executable -Arguments @(
                    '-s', $device.Serial, 'shell', 'getprop', 'ro.kernel.qemu'
                ))
                if ($qemu.Trim() -eq '1') {
                    $device.Serial
                }
            }
        )

        if ($emulators.Count -eq 0) {
            throw 'No authorized Android emulator is connected. Start an AVD and run adb devices -l.'
        }
        if ($emulators.Count -gt 1) {
            throw "Multiple emulators are connected: $($emulators -join ', '). Pass -Serial."
        }
        $selected = $emulators[0]
    }

    $selectedQemu = [string](Invoke-Adb -Executable $Executable -Arguments @(
        '-s', $selected, 'shell', 'getprop', 'ro.kernel.qemu'
    ))
    if ($selectedQemu.Trim() -ne '1') {
        throw "Device '$selected' is not an Android emulator; physical-device capture is intentionally blocked."
    }

    return $selected
}

function Assert-Viewport {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,

        [Parameter(Mandatory)]
        [string]$DeviceSerial
    )

    $sizeOutput = [string](Invoke-Adb -Executable $Executable -Arguments @(
        '-s', $DeviceSerial, 'shell', 'wm', 'size'
    ))
    $physicalMatches = [regex]::Matches(
        $sizeOutput,
        '(?im)^\s*Physical size:\s*(\d+)x(\d+)\s*$'
    )
    $overrideMatches = [regex]::Matches(
        $sizeOutput,
        '(?im)^\s*Override size:\s*(\d+)x(\d+)\s*$'
    )
    $effectiveMatch = if ($overrideMatches.Count -gt 0) {
        $overrideMatches[$overrideMatches.Count - 1]
    }
    elseif ($physicalMatches.Count -gt 0) {
        $physicalMatches[$physicalMatches.Count - 1]
    }
    else {
        throw "Could not parse emulator size from: $sizeOutput"
    }

    $width = [int]$effectiveMatch.Groups[1].Value
    $height = [int]$effectiveMatch.Groups[2].Value
    if ($width -ne $expectedWidth -or $height -ne $expectedHeight) {
        throw "Emulator '$DeviceSerial' is ${width}x${height}; required effective size is ${expectedWidth}x${expectedHeight} portrait. This script never resizes the emulator."
    }

    $fontScaleText = [string](Invoke-Adb -Executable $Executable -Arguments @(
        '-s', $DeviceSerial, 'shell', 'settings', 'get', 'system', 'font_scale'
    ))
    $fontScale = 0.0
    $parsedFontScale = [double]::TryParse(
        $fontScaleText.Trim(),
        [Globalization.NumberStyles]::Float,
        [Globalization.CultureInfo]::InvariantCulture,
        [ref]$fontScale
    )
    if ($parsedFontScale -and [Math]::Abs($fontScale - 1.0) -gt 0.001) {
        throw "Emulator font scale is $fontScaleText; reset it to the Android default (1.0) before capture."
    }
    if (-not $parsedFontScale) {
        throw "Could not verify Android font scale ('$fontScaleText'); capture is blocked."
    }

    $densityOutput = [string](Invoke-Adb -Executable $Executable -Arguments @(
        '-s', $DeviceSerial, 'shell', 'wm', 'density'
    ))
    $physicalDensityMatches = [regex]::Matches(
        $densityOutput,
        '(?im)^\s*Physical density:\s*(\d+)\s*$'
    )
    $overrideDensityMatches = [regex]::Matches(
        $densityOutput,
        '(?im)^\s*Override density:\s*(\d+)\s*$'
    )
    if ($physicalDensityMatches.Count -ne 1) {
        throw "Could not verify the emulator's physical display density from: $densityOutput"
    }
    if ($overrideDensityMatches.Count -gt 0) {
        $overrideDensity = $overrideDensityMatches[$overrideDensityMatches.Count - 1].Groups[1].Value
        throw "Emulator display density is overridden to $overrideDensity. Reset Display size to the Android default before capture."
    }
    $physicalDensity = [int]$physicalDensityMatches[0].Groups[1].Value

    return [pscustomobject]@{
        Width = $width
        Height = $height
        Density = $physicalDensity
        UsesSizeOverride = $overrideMatches.Count -gt 0
    }
}

function Assert-ReleaseCandidateInstalled {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,

        [Parameter(Mandatory)]
        [string]$DeviceSerial
    )

    $packagePath = [string](Invoke-Adb -Executable $Executable -Arguments @(
        '-s', $DeviceSerial, 'shell', 'pm', 'path', $packageName
    ))
    if ($packagePath -notmatch '(?m)^package:.+\.apk\s*$') {
        throw "Package '$packageName' is not installed on emulator '$DeviceSerial'."
    }

    $packageDump = [string](Invoke-Adb -Executable $Executable -Arguments @(
        '-s', $DeviceSerial, 'shell', 'dumpsys', 'package', $packageName
    ))
    if ($packageDump -match '(?im)^\s*(?:pkgFlags|flags)=\[[^\]]*\bDEBUGGABLE\b') {
        throw "Installed package '$packageName' is debuggable. Install the signed release candidate or internal-track build."
    }

    $versionName = if ($packageDump -match '(?m)^\s*versionName=(\S+)\s*$') {
        $Matches[1]
    }
    else {
        'unknown'
    }
    $versionCode = if ($packageDump -match '(?m)^\s*versionCode=(\d+)') {
        $Matches[1]
    }
    else {
        'unknown'
    }

    return [pscustomobject]@{
        VersionName = $versionName
        VersionCode = $versionCode
    }
}

function Assert-ReamForeground {
    param(
        [Parameter(Mandatory)]
        [string]$Executable,

        [Parameter(Mandatory)]
        [string]$DeviceSerial
    )

    $activityDump = [string](Invoke-Adb -Executable $Executable -Arguments @(
        '-s', $DeviceSerial, 'shell', 'dumpsys', 'activity', 'activities'
    ))
    $escapedPackage = [regex]::Escape($packageName)
    $resumedPattern = "(?im)^\s*(?:mResumedActivity|topResumedActivity|ResumedActivity).*${escapedPackage}"
    if ($activityDump -match $resumedPattern) {
        return
    }

    $windowDump = [string](Invoke-Adb -Executable $Executable -Arguments @(
        '-s', $DeviceSerial, 'shell', 'dumpsys', 'window', 'windows'
    ))
    $focusPattern = "(?im)^\s*(?:mCurrentFocus|mFocusedApp)=.*${escapedPackage}"
    if ($windowDump -notmatch $focusPattern) {
        throw "Ream ($packageName) is not the foreground app. Close the picker, camera, keyboard dialog, or other app before capture."
    }
}

function Save-NewFileAtomically {
    param(
        [Parameter(Mandatory)]
        [string]$Destination,

        [Parameter(Mandatory)]
        [byte[]]$Bytes,

        [Parameter(Mandatory)]
        [string]$RootDirectory
    )

    if ([IO.File]::Exists($Destination)) {
        throw "Refusing to overwrite existing screenshot: $Destination"
    }

    $temporaryName = '.ream-capture-' + [guid]::NewGuid().ToString('N') + '.tmp'
    $temporaryPath = [IO.Path]::GetFullPath((Join-Path $RootDirectory $temporaryName))
    $temporaryParent = [IO.Path]::GetDirectoryName($temporaryPath)
    $normalizedTemporaryParent = $temporaryParent.TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    $normalizedRootDirectory = $RootDirectory.TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    if (-not [string]::Equals($normalizedTemporaryParent, $normalizedRootDirectory, [StringComparison]::OrdinalIgnoreCase) -or
        -not [IO.Path]::GetFileName($temporaryPath).StartsWith('.ream-capture-', [StringComparison]::Ordinal)) {
        throw 'Refusing to create a temporary file outside the screenshot directory.'
    }

    $moved = $false
    try {
        $stream = [IO.File]::Open(
            $temporaryPath,
            [IO.FileMode]::CreateNew,
            [IO.FileAccess]::Write,
            [IO.FileShare]::None
        )
        try {
            $stream.Write($Bytes, 0, $Bytes.Length)
            $stream.Flush($true)
        }
        finally {
            $stream.Dispose()
        }

        if ([IO.File]::Exists($Destination)) {
            throw "Refusing to overwrite screenshot created during capture: $Destination"
        }
        [IO.File]::Move($temporaryPath, $Destination)
        $moved = $true
    }
    finally {
        if (-not $moved -and [IO.File]::Exists($temporaryPath)) {
            [IO.File]::Delete($temporaryPath)
        }
    }
}

function Read-CaptureAction {
    param([Parameter(Mandatory)][pscustomobject]$CaptureState)

    Write-Host ''
    Write-Host "State $($CaptureState.Number) of 6: $($CaptureState.Title)"
    Write-Host "Output: $($CaptureState.FileName)"
    foreach ($instruction in $CaptureState.Instructions) {
        Write-Host "  - $instruction"
    }

    while ($true) {
        $answer = (Read-Host 'Press Enter to capture, S to skip, or Q to finish').Trim()
        switch ($answer.ToUpperInvariant()) {
            '' { return 'capture' }
            'S' { return 'skip' }
            'Q' { return 'quit' }
            default { Write-Host 'Enter, S, and Q are the only accepted choices.' }
        }
    }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'This capture helper currently supports Windows PowerShell only.'
}

Initialize-PngSupport
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$selectedNumbers = @($State | Sort-Object -Unique)
$selectedStates = @($captureStates | Where-Object { $_.Number -in $selectedNumbers })
if ($selectedStates.Count -ne $selectedNumbers.Count) {
    throw 'Every requested state must be a number from 1 through 6.'
}

if ($ValidateOnly) {
    if (-not [IO.Directory]::Exists($outputRoot)) {
        throw "Screenshot directory does not exist: $outputRoot"
    }
    foreach ($captureState in $selectedStates) {
        $path = Join-Path $outputRoot $captureState.FileName
        $info = Assert-PlayScreenshotFile -Path $path -CaptureState $captureState
        Write-Host "[OK] $($captureState.FileName): $($info.Width)x$($info.Height), 8-bit RGB, no alpha"
    }
    Write-Host "Validated $($selectedStates.Count) Play screenshot(s) in $outputRoot"
    return
}

[IO.Directory]::CreateDirectory($outputRoot) | Out-Null

foreach ($captureState in $selectedStates) {
    $destination = Join-Path $outputRoot $captureState.FileName
    if ([IO.File]::Exists($destination)) {
        throw "Refusing to start because '$($captureState.FileName)' already exists. Move it aside or validate it with -ValidateOnly."
    }
}

$adb = Resolve-AdbExecutable -RequestedPath $AdbPath
$deviceSerial = Get-ConnectedEmulatorSerial -Executable $adb -RequestedSerial $Serial
$viewport = Assert-Viewport -Executable $adb -DeviceSerial $deviceSerial
$release = Assert-ReleaseCandidateInstalled -Executable $adb -DeviceSerial $deviceSerial

Write-Host "Emulator: $deviceSerial ($($viewport.Width)x$($viewport.Height), $($viewport.Density) dpi)"
if ($viewport.UsesSizeOverride) {
    Write-Warning 'The emulator uses a wm size override. The PNG dimensions will still be enforced; confirm display scaling looks natural.'
}
Write-Host "Installed Ream: version $($release.VersionName), code $($release.VersionCode), non-debuggable"
Write-Host 'The script captures real framebuffer pixels only. It does not navigate, seed app data, resize, crop, or fabricate UI.'

$capturedCount = 0
foreach ($captureState in $selectedStates) {
    $action = Read-CaptureAction -CaptureState $captureState
    if ($action -eq 'quit') {
        break
    }
    if ($action -eq 'skip') {
        continue
    }

    Assert-Viewport -Executable $adb -DeviceSerial $deviceSerial | Out-Null
    Assert-ReamForeground -Executable $adb -DeviceSerial $deviceSerial
    $rawPng = Invoke-Adb -Executable $adb -Arguments @(
        '-s', $deviceSerial, 'exec-out', 'screencap', '-p'
    ) -Binary -TimeoutMilliseconds 60000

    try {
        $rgbPng = [ReamScreenshotPng]::ToOpaqueRgb($rawPng, $expectedWidth, $expectedHeight)
    }
    catch {
        throw "Could not normalize '$($captureState.FileName)': $($_.Exception.GetBaseException().Message)"
    }

    Assert-PlayScreenshotBytes -Bytes $rgbPng -Label $captureState.FileName | Out-Null
    $destination = Join-Path $outputRoot $captureState.FileName
    Save-NewFileAtomically -Destination $destination -Bytes $rgbPng -RootDirectory $outputRoot
    Assert-PlayScreenshotFile -Path $destination -CaptureState $captureState | Out-Null
    $capturedCount++
    Write-Host "[SAVED] $destination"
}

Write-Host "Captured $capturedCount new screenshot(s). Existing files were never overwritten."
Write-Host "Re-run with -ValidateOnly before uploading:"
Write-Host "  pwsh -File `"$PSCommandPath`" -OutputDirectory `"$outputRoot`" -ValidateOnly"
