import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  IMAGE_MAX_DIMENSION_PX,
  IMAGE_COMPRESSION_QUALITY,
  IMAGE_UPLOAD_TIMEOUT_MS,
  IMAGE_COMPRESSION_TIMEOUT_MS,
} from "../constants"
import { auth } from "../firebase"

/**
 * Compresses an image file to WebP at reduced dimensions before upload.
 * Non-image files (e.g. PDFs) are returned unchanged.
 */
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve) => {
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

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeoutTimer = setTimeout(
      () => reject(new Error(`Image upload timed out after ${timeoutMs / 1000} seconds. Please check your internet connection.`)),
      timeoutMs
    )
    promise.then(
      (value) => { clearTimeout(timeoutTimer); resolve(value) },
      (error) => { clearTimeout(timeoutTimer); reject(error) }
    )
  })
}

export interface UploadOptions {
  folder?: "talasys/residents" | "talasys/proofs" | "talasys/receipts" | "talasys/signatures" | "talasys/letters"
  ticket?: string
}

/**
 * Uploads a file to Cloudinary with authenticated signing and constrained parameters (#51, #52).
 */
export async function uploadFileToCloudinary(file: File, options?: UploadOptions): Promise<string> {
  const compressedFile = await compressImage(file)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  // Use Firebase Auth ID token if available
  let token: string | null = null
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken()
      headers["Authorization"] = `Bearer ${token}`
    } catch {
      // Unauthenticated or token fetch failed
    }
  }

  // If unauthenticated (e.g. during resident registration), acquire a registration ticket (#51)
  let ticket = options?.ticket
  if (!token && !ticket) {
    try {
      const ticketRes = await fetch("/api/auth/registration-ticket", { method: "POST" })
      if (ticketRes.ok) {
        const ticketData = await ticketRes.json()
        ticket = ticketData.ticket
      }
    } catch (ticketErr) {
      console.warn("Could not acquire registration ticket:", ticketErr)
    }
  }

  const signResponse = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers,
    body: JSON.stringify({
      folder: options?.folder || (ticket || !token ? "talasys/proofs" : "talasys/residents"),
      ticket,
    }),
  })
  
  if (!signResponse.ok) {
    const errBody = await signResponse.json().catch(() => ({}))
    throw new Error(errBody.error || "Failed to authenticate upload request securely.")
  }
  
  const { signature, timestamp, folder, type, publicId, apiKey, claimToken } = await signResponse.json()

  const formData = new FormData()
  formData.append("file", compressedFile)
  formData.append("api_key", apiKey || CLOUDINARY_API_KEY)
  formData.append("timestamp", timestamp.toString())
  formData.append("signature", signature)
  if (folder) {
    formData.append("folder", folder)
  }
  if (publicId) {
    formData.append("public_id", publicId)
  }
  if (type) {
    formData.append("type", type)
  }

  // Use /auto/upload so Cloudinary properly accepts and classifies both images and PDFs (#51, #52)
  const response = await withTimeout(
    fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
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
      "Check your network connection and try again."
    )
  }

  const responseData = await response.json()
  const secureUrl = responseData.secure_url
  if (claimToken && secureUrl) {
    preRegistrationClaimTokens.set(secureUrl, claimToken)
  }
  return secureUrl
}

export const preRegistrationClaimTokens = new Map<string, string>()

/**
 * Convenience helper to upload sensitive proof or receipt files directly to protected storage (#52).
 */
export async function uploadProtectedFileToCloudinary(file: File, options?: Omit<UploadOptions, "folder"> & { folder?: "talasys/proofs" | "talasys/receipts" | "talasys/letters" }): Promise<string> {
  return uploadFileToCloudinary(file, {
    ...options,
    folder: options?.folder || "talasys/proofs",
  })
}
