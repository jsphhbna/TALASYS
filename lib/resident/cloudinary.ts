import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  IMAGE_MAX_DIMENSION_PX,
  IMAGE_COMPRESSION_QUALITY,
  IMAGE_UPLOAD_TIMEOUT_MS,
  IMAGE_COMPRESSION_TIMEOUT_MS,
} from "../constants"

/**
 * Compresses an image file to WebP at reduced dimensions before upload.
 * Non-image files are returned unchanged.
 *
 * WebP at 70% quality is used because it produces files ~3-5x smaller than
 * JPEG at equivalent visual quality, drastically reducing Cloudinary upload time.
 */
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve) => {
    // Safety net: if canvas operations hang (e.g. corrupt file), fall back to the original.
    const compressionTimeoutTimer = setTimeout(() => {
      console.warn("Image compression timed out — uploading original file as fallback.")
      resolve(file)
    }, IMAGE_COMPRESSION_TIMEOUT_MS)

    const finishWithResult = (result: Blob | File) => {
      clearTimeout(compressionTimeoutTimer)
      resolve(result)
    }

    if (!file.type.startsWith("image/")) {
      finishWithResult(file)
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      if (!event.target?.result) {
        finishWithResult(file)
        return
      }
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas")
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > IMAGE_MAX_DIMENSION_PX) {
              height *= IMAGE_MAX_DIMENSION_PX / width
              width = IMAGE_MAX_DIMENSION_PX
            }
          } else {
            if (height > IMAGE_MAX_DIMENSION_PX) {
              width *= IMAGE_MAX_DIMENSION_PX / height
              height = IMAGE_MAX_DIMENSION_PX
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          if (!ctx) {
             finishWithResult(file)
             return
          }
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              if (blob) finishWithResult(blob)
              else finishWithResult(file)
            },
            "image/webp",
            IMAGE_COMPRESSION_QUALITY
          )
        } catch (canvasError) {
          console.error("Canvas image compression failed:", canvasError)
          finishWithResult(file)
        }
      }
      img.onerror = () => finishWithResult(file)
      img.src = event.target.result as string
    }
    reader.onerror = () => finishWithResult(file)
    reader.readAsDataURL(file)
  })
}

/**
 * Wraps a promise with a hard timeout. Rejects with a descriptive error if
 * the promise does not resolve within `timeoutMs` milliseconds.
 */
const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeoutTimer = setTimeout(
      () => reject(new Error(`Image upload timed out after ${timeoutMs / 1000} seconds. Your connection may be too slow — try a smaller image or check your internet.`)),
      timeoutMs
    )
    promise.then(
      (value) => { clearTimeout(timeoutTimer); resolve(value) },
      (error) => { clearTimeout(timeoutTimer); reject(error) }
    )
  })
}

/**
 * Compresses and uploads a file to Cloudinary using a signed upload request.
 * Returns the secure CDN URL of the uploaded file.
 *
 * Why signed upload: unsigned uploads require relaxed Cloudinary security settings.
 * A SHA-1 signature generated from the timestamp and API secret ensures each upload
 * request is authenticated without exposing the secret in the network request body.
 *
 * @throws {Error} if the upload fails or times out.
 */
export async function uploadFileToCloudinary(file: File): Promise<string> {
  const compressedFile = await compressImage(file)

  const uploadTimestamp = Math.round(new Date().getTime() / 1000)

  // SHA-1 signature authenticates the upload without sending the secret over the wire.
  const signatureString = `timestamp=${uploadTimestamp}${CLOUDINARY_API_SECRET}`
  const encodedSignatureMessage = new TextEncoder().encode(signatureString)
  const signatureHashBuffer = await crypto.subtle.digest("SHA-1", encodedSignatureMessage)
  const signatureHashBytes = Array.from(new Uint8Array(signatureHashBuffer))
  const signature = signatureHashBytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")

  const formData = new FormData()
  formData.append("file", compressedFile)
  formData.append("api_key", CLOUDINARY_API_KEY)
  formData.append("timestamp", uploadTimestamp.toString())
  formData.append("signature", signature)

  const response = await withTimeout(
    fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: formData,
    }),
    IMAGE_UPLOAD_TIMEOUT_MS
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Cloudinary upload failed:", errorData || response.statusText)
    throw new Error(
      "Image upload failed. Cloudinary returned an error. " +
      "Check your network connection and try again. If the problem persists, contact support."
    )
  }

  const responseData = await response.json()
  return responseData.secure_url
}
