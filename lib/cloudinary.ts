export async function uploadFileToCloudinary(file: File): Promise<string> {
  const cloudName = "gmseg91m"
  const apiKey = "588324923391267"
  const apiSecret = "2wGosQ3mRbcwLTpq4W2u0AXn8Sk"
  const timestamp = Math.round(new Date().getTime() / 1000)

  // Generate SHA-1 signature for signed upload
  const signatureString = `timestamp=${timestamp}${apiSecret}`
  const msgUint8 = new TextEncoder().encode(signatureString)
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const signature = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

  const formData = new FormData()
  formData.append("file", file)
  formData.append("api_key", apiKey)
  formData.append("timestamp", timestamp.toString())
  formData.append("signature", signature)
  // Optionally append the preset if it was created as a signed preset, but default is fine.

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Cloudinary upload failed:", errorData || response.statusText)
    throw new Error("Failed to upload image to Cloudinary")
  }

  const data = await response.json()
  return data.secure_url
}
