import Tesseract from 'tesseract.js'

export interface ParsedIdData {
  firstName: string
  lastName: string
  dateOfBirth: string
}

export async function parseIdImage(file: File): Promise<ParsedIdData> {
  const result: ParsedIdData = {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
  }

  try {
    const { data } = await Tesseract.recognize(file, 'eng', {
      logger: (m) => console.log("OCR Progress:", m)
    })

    const text = data.text
    console.log("Extracted OCR Text:", text)

    // Common Date Patterns (e.g., 01/25/1990, 1990-01-25, Jan 25, 1990)
    const dateRegexes = [
      /(?:DOB|Date of Birth|Birthdate)[\s:]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
      /(?:DOB|Date of Birth|Birthdate)[\s:]*([A-Za-z]{3,9}\s\d{1,2},?\s\d{4})/i,
      /(\d{4}[\/\-]\d{2}[\/\-]\d{2})/, // ISO
      /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/ // Standard
    ]

    for (const regex of dateRegexes) {
      const match = text.match(regex)
      if (match && match[1]) {
        result.dateOfBirth = match[1].trim()
        
        // If it matched a raw date without label, only use it if we haven't found one with a label yet
        if (regex.source.includes('DOB')) {
           break // Found a high confidence match, stop looking
        }
      }
    }

    // Attempt to find First/Given Name and Last Name
    // PhilID and standard IDs usually say "Last Name" then the name on the next line
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      
      if (line.includes("last name") || line.includes("surname")) {
        // Assume next line is the actual last name, unless the name is on the same line
        if (lines[i+1] && !lines[i+1].toLowerCase().includes("name")) {
          result.lastName = lines[i+1]
        }
      }
      
      if (line.includes("first name") || line.includes("given name")) {
        if (lines[i+1] && !lines[i+1].toLowerCase().includes("name")) {
          result.firstName = lines[i+1]
        }
      }
    }
    
    // Capitalize properly
    if (result.firstName) {
      result.firstName = result.firstName.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase())
    }
    if (result.lastName) {
      result.lastName = result.lastName.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase())
    }

    // Clean up Date of Birth to match expected YYYY-MM-DD input if possible
    if (result.dateOfBirth) {
       try {
         const parsedDate = new Date(result.dateOfBirth)
         if (!isNaN(parsedDate.getTime())) {
           result.dateOfBirth = parsedDate.toISOString().split('T')[0]
         }
       } catch (e) {}
    }

    return result

  } catch (error) {
    console.error("OCR Parsing failed:", error)
    throw new Error("Failed to process ID image")
  }
}
