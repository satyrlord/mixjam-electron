param(
    [Parameter(Mandatory = $true)]
    [long]$NativeWindowHandle,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedImagePath,

    [Parameter(Mandatory = $false)]
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class MixJamWindowIconProbe
{
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")]
    public static extern IntPtr GetClassLongPtr64(IntPtr hWnd, int index);

    [DllImport("user32.dll", EntryPoint = "GetClassLongW")]
    public static extern IntPtr GetClassLong32(IntPtr hWnd, int index);

    public static IntPtr GetClassIcon(IntPtr hWnd, int index)
    {
        return IntPtr.Size == 8 ? GetClassLongPtr64(hWnd, index) : GetClassLong32(hWnd, index);
    }
}
'@

$windowHandle = [IntPtr]::new($NativeWindowHandle)
if ($windowHandle -eq [IntPtr]::Zero) {
    throw 'The supplied native window handle is zero.'
}

$wmGetIcon = 0x007F
$iconHandle = [MixJamWindowIconProbe]::SendMessage($windowHandle, $wmGetIcon, [IntPtr]1, [IntPtr]0)
if ($iconHandle -eq [IntPtr]::Zero) {
    $iconHandle = [MixJamWindowIconProbe]::SendMessage($windowHandle, $wmGetIcon, [IntPtr]0, [IntPtr]0)
}
if ($iconHandle -eq [IntPtr]::Zero) {
    $iconHandle = [MixJamWindowIconProbe]::GetClassIcon($windowHandle, -14)
}
if ($iconHandle -eq [IntPtr]::Zero) {
    $iconHandle = [MixJamWindowIconProbe]::GetClassIcon($windowHandle, -34)
}
if ($iconHandle -eq [IntPtr]::Zero) {
    throw "The native MixJam window did not expose an icon handle."
}

$actualIcon = [System.Drawing.Icon]::FromHandle($iconHandle)
$actualBitmap = $actualIcon.ToBitmap()
$expectedBitmap = [System.Drawing.Bitmap]::FromFile($ExpectedImagePath)

if ($expectedBitmap.Width -ne $actualBitmap.Width -or $expectedBitmap.Height -ne $actualBitmap.Height) {
    throw "Expected image dimensions must match the native icon dimensions."
}

try {
    if ($OutputDirectory) {
        New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
        $actualBitmap.Save((Join-Path $OutputDirectory 'actual-window-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $expectedBitmap.Save((Join-Path $OutputDirectory 'expected-window-icon-probe.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    $matchingPixels = 0
    $totalPixels = $actualBitmap.Width * $actualBitmap.Height
    for ($y = 0; $y -lt $actualBitmap.Height; $y++) {
        for ($x = 0; $x -lt $actualBitmap.Width; $x++) {
            if ($actualBitmap.GetPixel($x, $y).ToArgb() -eq $expectedBitmap.GetPixel($x, $y).ToArgb()) {
                $matchingPixels++
            }
        }
    }

    $bestMeanDifference = [double]::PositiveInfinity
    $bestForegroundIntersectionOverUnion = 0.0
    $bestSize = 0
    $bestBitmap = $null
    for ($size = 16; $size -le $actualBitmap.Width; $size++) {
        $candidate = New-Object System.Drawing.Bitmap($actualBitmap.Width, $actualBitmap.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($candidate)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $offsetX = [int](($actualBitmap.Width - $size) / 2)
            $offsetY = [int](($actualBitmap.Height - $size) / 2)
            $graphics.DrawImage($expectedBitmap, $offsetX, $offsetY, $size, $size)
        }
        finally {
            $graphics.Dispose()
        }

        $difference = 0.0
        $foregroundIntersection = 0
        $foregroundUnion = 0
        for ($y = 0; $y -lt $actualBitmap.Height; $y++) {
            for ($x = 0; $x -lt $actualBitmap.Width; $x++) {
                $actual = $actualBitmap.GetPixel($x, $y)
                $expected = $candidate.GetPixel($x, $y)
                $difference += [Math]::Abs($actual.A - $expected.A)
                $difference += [Math]::Abs($actual.R - $expected.R)
                $difference += [Math]::Abs($actual.G - $expected.G)
                $difference += [Math]::Abs($actual.B - $expected.B)
                $actualForeground = $actual.A -gt 16
                $expectedForeground = $expected.A -gt 16
                if ($actualForeground -or $expectedForeground) { $foregroundUnion++ }
                if ($actualForeground -and $expectedForeground) { $foregroundIntersection++ }
            }
        }
        $meanDifference = $difference / ($totalPixels * 4)
        if ($meanDifference -lt $bestMeanDifference) {
            if ($bestBitmap) { $bestBitmap.Dispose() }
            $bestBitmap = $candidate
            $bestMeanDifference = $meanDifference
            $bestForegroundIntersectionOverUnion = if ($foregroundUnion -eq 0) {
                1.0
            } else {
                $foregroundIntersection / $foregroundUnion
            }
            $bestSize = $size
        } else {
            $candidate.Dispose()
        }
    }

    if ($OutputDirectory -and $bestBitmap) {
        $bestBitmap.Save((Join-Path $OutputDirectory 'best-aligned-expected-window-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    }

    [pscustomobject]@{
        windowHandle = $windowHandle.ToInt64()
        iconWidth = $actualBitmap.Width
        iconHeight = $actualBitmap.Height
        matchingPixels = $matchingPixels
        totalPixels = $totalPixels
        matchRatio = $matchingPixels / $totalPixels
        bestAlignedSize = $bestSize
        bestMeanAbsoluteChannelDifference = $bestMeanDifference
        bestForegroundIntersectionOverUnion = $bestForegroundIntersectionOverUnion
        expectedImagePath = (Resolve-Path -LiteralPath $ExpectedImagePath).Path
        outputDirectory = if ($OutputDirectory) { (Resolve-Path -LiteralPath $OutputDirectory).Path } else { $null }
    } | ConvertTo-Json -Compress
}
finally {
    if ($bestBitmap) { $bestBitmap.Dispose() }
    $actualBitmap.Dispose()
    $expectedBitmap.Dispose()
}
