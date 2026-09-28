import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const secret = process.env.CLOUDINARY_API_SECRET;
    if (!secret) {
      console.error("Cloudinary sign error: CLOUDINARY_API_SECRET is not configured on the server.");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await req.json();
    const { timestamp } = body;

    if (!timestamp) {
      return NextResponse.json({ error: "Missing timestamp" }, { status: 400 });
    }

    // SHA-1 signature authenticates the upload without sending the secret over the wire.
    const signatureString = `timestamp=${timestamp}${secret}`;
    const encodedSignatureMessage = new TextEncoder().encode(signatureString);
    const signatureHashBuffer = await crypto.subtle.digest("SHA-1", encodedSignatureMessage);
    const signatureHashBytes = Array.from(new Uint8Array(signatureHashBuffer));
    const signature = signatureHashBytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");

    return NextResponse.json({ signature });
  } catch (error) {
    console.error("Cloudinary sign error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
