[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$file_info,
    
    [Parameter(Mandatory=$true)]
    [string]$path_build,
    
    [Parameter(Mandatory=$true)]
    [string]$image
)

function Extract-Info {
    param (
        [string]$filePath,
        [hashtable]$patterns
    )
    
    if (-not (Test-Path $filePath)) {
        return $null
    }
    
    $content = Get-Content $filePath -Raw
    $result = @{}
    
    foreach ($key in $patterns.Keys) {
        $match = [regex]::Match($content, $patterns[$key])
        if ($match.Success) {
            $result[$key] = $match.Groups[1].Value
        }
        else {
            $result[$key] = $null
        }
    }
    
    return $result
}

function Upload-Image {
    param (
        [string]$binPath,
        [string]$url,
        [string]$newFileName,
        [int]$timeout = 30
    )
    
    try {
        Write-Verbose "Uploading file: $newFileName to $url"
        $fileBytes = [System.IO.File]::ReadAllBytes($binPath)
        $fileEnc = [System.Text.Encoding]::GetEncoding('ISO-8859-1').GetString($fileBytes)
        $boundary = [System.Guid]::NewGuid().ToString()
        $LF = "`r`n"
        
        $bodyLines = (
            "--$boundary",
            "Content-Disposition: form-data; name=`"image`"; filename=`"$newFileName`"",
            "Content-Type: application/octet-stream$LF",
            $fileEnc,
            "--$boundary--$LF"
        ) -join $LF
        
        $response = Invoke-RestMethod -Uri $url -Method Put -ContentType "multipart/form-data; boundary=`"$boundary`"" -Body $bodyLines -TimeoutSec $timeout
        Write-Verbose "Upload response: $response"
        return $response
    }
    catch {
        throw "Upload failed: $_"
    }
}

# Main script
$patterns = @{
    'type' = '#define\s+DEFAULT_SOFTWARE_TYPE\s+"([^"]+)"'
    'vers' = '#define\s+DEFAULT_SOFTWARE_VERS\s+"(\d+\.\d+\.\d+)"'
}

Write-Verbose "Extracting info from $file_info"
$matches = Extract-Info -filePath $file_info -patterns $patterns

if (-not $matches -or ($matches.Values -contains $null)) {
    Write-Error "Could not extract type or vers from 'Config.hpp'"
    exit 1
}

Write-Verbose "Extracted type: $($matches['type'])"
Write-Verbose "Extracted version: $($matches['vers'])"

$new_name = "$($matches['type'])_v$($matches['vers']).bin"
$new_path = Join-Path $path_build $new_name

Write-Verbose "New filename: $new_name"
Write-Verbose "New file path: $new_path"

if (Test-Path $new_path) {
    Write-Output "Image $new_name already exists in build directory. No action taken."
    exit 0
}

$server_url = if ($env:FIRMWARE_UPLOAD_URL) { $env:FIRMWARE_UPLOAD_URL } else { "http://weather.local/images" }
Write-Verbose "Server URL: $server_url"

try {
    Write-Verbose "Uploading image: $image as $new_name"
    Upload-Image -binPath $image -url $server_url -newFileName $new_name
    Write-Output "Image upload succeeded: $new_name"
    
    # Copy the file to the build directory with the new name
    Copy-Item -Path $image -Destination $new_path -Force
    Write-Output "Image copied to build directory: $new_path"
}
catch {
    Write-Error "An error occurred: $_"
    exit 1
}

