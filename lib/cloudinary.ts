const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve) => {
    const fallbackTimer = setTimeout(() => {
      console.warn("Image compression timed out, returning original file")
      resolve(file)
    }, 8000)

    const finish = (result: Blob | File) => {
      clearTimeout(fallbackTimer)
      resolve(result)
    }

    // Only compress images
    if (!file.type.startsWith("image/")) {
      finish(file)
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      if (!event.target?.result) {
        finish(file)
        return
      }
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas")
          let width = img.width
          let height = img.height

          // Max dimensions
          const MAX_DIMENSION = 1200
          if (width > height) {
            if (width > MAX_DIMENSION) {
              height *= MAX_DIMENSION / width
              width = MAX_DIMENSION
            }
          } else {
            if (height > MAX_DIMENSION) {
              width *= MAX_DIMENSION / height
              height = MAX_DIMENSION
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          if (!ctx) {
             finish(file)
             return
          }
          ctx.drawImage(img, 0, 0, width, height)

          // Compress as WebP at 70% quality (extremely fast and small)
          canvas.toBlob(
            (blob) => {
              if (blob) finish(blob)
              else finish(file) // Fallback to original if compression fails
            },
            "image/webp",
            0.7
          )
        } catch (e) {
          console.error("Canvas compression failed:", e)
          finish(file)
        }
      }
      img.onerror = () => finish(file) // Fallback if image loading fails
      img.src = event.target.result as string
    }
    reader.onerror = () => finish(file)
    reader.readAsDataURL(file)
  })
}

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Upload timed out")), ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

export async function uploadFileToCloudinary(file: File): Promise<string> {
  // Compress image before upload to drastically speed up upload times
  const compressedFile = await compressImage(file)

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

  const response = await withTimeout(
    fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    }),
    20000 // 20 second timeout
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Cloudinary upload failed:", errorData || response.statusText)
    throw new Error("Failed to upload image to Cloudinary")
  }

  const data = await response.json()
  return data.secure_url
}
