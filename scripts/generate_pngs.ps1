Add-Type -AssemblyName System.Drawing

$sizes = @(16, 48, 128)
$iconsDir = Join-Path $PSScriptRoot "..\icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null
}

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Background gradient
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42)) # Slate 900
    $g.FillRectangle($brush, $rect)

    # Scale factor
    $s = $size / 128.0

    # Rounded outer monitor frame
    $penMonitor = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 71, 85, 105)), (3 * $s)
    $g.DrawRectangle($penMonitor, (20 * $s), (24 * $s), (88 * $s), (64 * $s))

    # Cropped region highlight
    $cropBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(100, 56, 189, 248))
    $g.FillRectangle($cropBrush, (40 * $s), (44 * $s), (48 * $s), (28 * $s))

    $penCrop = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 56, 189, 248)), (2.5 * $s)
    $penCrop.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
    $g.DrawRectangle($penCrop, (40 * $s), (44 * $s), (48 * $s), (28 * $s))

    # Corner brackets in Cyan
    $penCorner = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 99, 102, 241)), (4 * $s)
    # Top-Left
    $g.DrawLines($penCorner, @(
        (New-Object System.Drawing.PointF (34 * $s), (50 * $s)),
        (New-Object System.Drawing.PointF (34 * $s), (40 * $s)),
        (New-Object System.Drawing.PointF (44 * $s), (40 * $s))
    ))
    # Top-Right
    $g.DrawLines($penCorner, @(
        (New-Object System.Drawing.PointF (84 * $s), (40 * $s)),
        (New-Object System.Drawing.PointF (94 * $s), (40 * $s)),
        (New-Object System.Drawing.PointF (94 * $s), (50 * $s))
    ))
    # Bottom-Left
    $g.DrawLines($penCorner, @(
        (New-Object System.Drawing.PointF (34 * $s), (66 * $s)),
        (New-Object System.Drawing.PointF (34 * $s), (76 * $s)),
        (New-Object System.Drawing.PointF (44 * $s), (76 * $s))
    ))
    # Bottom-Right
    $g.DrawLines($penCorner, @(
        (New-Object System.Drawing.PointF (84 * $s), (76 * $s)),
        (New-Object System.Drawing.PointF (94 * $s), (76 * $s)),
        (New-Object System.Drawing.PointF (94 * $s), (66 * $s))
    ))

    # Stream play triangle
    $playBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $playPoints = @(
        (New-Object System.Drawing.PointF (61 * $s), (53 * $s)),
        (New-Object System.Drawing.PointF (61 * $s), (63 * $s)),
        (New-Object System.Drawing.PointF (71 * $s), (58 * $s))
    )
    $g.FillPolygon($playBrush, $playPoints)

    # Stand
    $penStand = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 100, 116, 139)), (3 * $s)
    $g.DrawLine($penStand, (64 * $s), (88 * $s), (64 * $s), (98 * $s))
    $g.DrawLine($penStand, (46 * $s), (98 * $s), (82 * $s), (98 * $s))

    $outPath = Join-Path $iconsDir "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created $outPath"
}
