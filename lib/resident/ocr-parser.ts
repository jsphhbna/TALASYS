import Tesseract from 'tesseract.js'

export interface ParsedIdData {
  firstName: string
  lastName: string
  dateOfBirth: string
}

/**
 * Extracts name and date-of-birth fields from a Philippine government ID image
 * using Tesseract OCR.
 *
 * @throws {Error} if OCR processing fails entirely (e.g. unreadable file format).
 */
export async function parseIdImage(file: File): Promise<ParsedIdData> {
  const result: ParsedIdData = {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
  }

  try {
    const { data } = await Tesseract.recognize(file, 'eng', {
      logger: (ocrProgressEvent) => console.log("OCR Progress:", ocrProgressEvent)
    })

    const ocrText = data.text

    // We try multiple date formats because Philippine IDs have no standard layout —
    // some use MM/DD/YYYY, some use ISO, and some spell out the month.
    const datePatterns = [
      /(?:DOB|Date of Birth|Birthdate)[\s:]*(\\d{2}[\\/\\-]\\d{2}[\\/\\-]\\d{4})/i,
      /(?:DOB|Date of Birth|Birthdate)[\s:]*([A-Za-z]{3,9}\s\d{1,2},?\s\d{4})/i,
      /(\d{4}[\\/\\-]\d{2}[\\/\\-]\d{2})/,
      /(\d{2}[\\/\\-]\d{2}[\\/\\-]\d{4})/
    ]

    for (const pattern of datePatterns) {
      const match = ocrText.match(pattern)
      if (match && match[1]) {
        result.dateOfBirth = match[1].trim()
        // A pattern with a labeled prefix (e.g. "DOB:") is high-confidence — stop searching.
        if (pattern.source.includes('DOB')) {
           break
        }
      }
    }

    // PhilID and most government IDs label their fields explicitly ("LAST NAME", "FIRST NAME"),
    // so we scan for those labels and extract the value from the following line.
    const textLines = ocrText.split('\n').map(line => line.trim()).filter(Boolean)
    
    for (let lineIndex = 0; lineIndex < textLines.length; lineIndex++) {
      const lowercaseLine = textLines[lineIndex].toLowerCase()
      
      if (lowercaseLine.includes("last name") || lowercaseLine.includes("surname")) {
        if (textLines[lineIndex + 1] && !textLines[lineIndex + 1].toLowerCase().includes("name")) {
          result.lastName = textLines[lineIndex + 1]
        }
      }
      
      if (lowercaseLine.includes("first name") || lowercaseLine.includes("given name")) {
        if (textLines[lineIndex + 1] && !textLines[lineIndex + 1].toLowerCase().includes("name")) {
          result.firstName = textLines[lineIndex + 1]
        }
      }
    }
    
    if (result.firstName) {
      result.firstName = result.firstName.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.substring(1).toLowerCase())
    }
    if (result.lastName) {
      result.lastName = result.lastName.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.substring(1).toLowerCase())
    }

    if (result.dateOfBirth) {
       try {
         const parsedDate = new Date(result.dateOfBirth)
         if (!isNaN(parsedDate.getTime())) {
           result.dateOfBirth = parsedDate.toISOString().split('T')[0]
         }
       } catch {
         // Date string could not be normalized — return the raw extracted value.
       }
    }

    return result

  } catch (error) {
    console.error("OCR parsing failed for uploaded file:", error)
    throw new Error(
      "Failed to extract data from the ID image. " +
      "Ensure the image is clear, well-lit, and not blurry, then try again."
    )
  }
}
