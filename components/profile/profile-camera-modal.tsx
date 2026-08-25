"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera, CheckCircle2, RotateCcw, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

interface ProfileCameraModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (base64Image: string) => Promise<void>
}

type StepPhase = "idle" | "align" | "blink" | "hold" | "capturing" | "done" | "error"

export function ProfileCameraModal({ isOpen, onClose, onSave }: ProfileCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  const [phase, setPhase] = useState<StepPhase>("idle")
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number>(0)
  const [isSaving, setIsSaving] = useState(false)
  
  const startCamera = async () => {
    try {
      setPhase("idle")
      setCapturedImage(null)
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } } 
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      
      // Start the simulated liveness sequence
      setPhase("align")
      
      setTimeout(() => {
        if (!mediaStream.active) return
        setPhase("blink")
        
        setTimeout(() => {
          if (!mediaStream.active) return
          setPhase("hold")
          setCountdown(3)
          
          let counter = 3
          const interval = setInterval(() => {
            counter--
            setCountdown(counter)
            if (counter <= 0) {
              clearInterval(interval)
              if (mediaStream.active) {
                setPhase("capturing")
                capturePhoto()
              }
            }
          }, 1000)
          
        }, 3500) // Give them 3.5s to blink
      }, 3000) // Give them 3s to align
      
    } catch (err) {
      console.error("Camera access denied or failed", err)
      setPhase("error")
    }
  }

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext("2d")
      
      if (context) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9)
        setCapturedImage(dataUrl)
        setPhase("done")
        stopCamera()
      }
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  useEffect(() => {
    if (isOpen) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleSave = async () => {
    if (!capturedImage) return
    setIsSaving(true)
    try {
      await onSave(capturedImage)
      onClose()
    } catch (error) {
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSaving) onClose() }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => { if (isSaving) e.preventDefault() }}>
        <DialogHeader>
          <DialogTitle>Setup Profile Picture</DialogTitle>
          <DialogDescription>
            For security, your profile picture must be taken using the live camera. 
            Once saved, this picture cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-[3/4] bg-slate-900 rounded-2xl overflow-hidden shadow-inner flex flex-col items-center justify-center my-4">
          {!capturedImage && phase !== "error" && (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" 
              />
              <div className="absolute inset-0 pointer-events-none">
                <div 
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.7) 45%)'
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`w-[70%] aspect-square rounded-full border-4 transition-colors duration-500 ${
                    phase === "align" ? "border-amber-400" :
                    phase === "blink" ? "border-blue-400" :
                    phase === "hold" || phase === "capturing" ? "border-emerald-400" :
                    "border-white/20"
                  }`} />
                </div>
              </div>
              <div className="absolute bottom-8 left-0 right-0 px-6 text-center z-10">
                <div className="bg-black/60 backdrop-blur-md rounded-lg py-3 px-4 text-white shadow-lg border border-white/10">
                  {phase === "idle" && <p className="animate-pulse text-sm">Connecting to camera...</p>}
                  {phase === "align" && <p className="text-sm font-medium animate-in fade-in zoom-in duration-300 text-amber-300">Please align your face in the circle.</p>}
                  {phase === "blink" && <p className="text-sm font-medium animate-in fade-in zoom-in duration-300 text-blue-300">Blink twice.</p>}
                  {phase === "hold" && <p className="text-sm font-medium animate-in fade-in zoom-in duration-300 text-emerald-300">Hold still... {countdown}</p>}
                  {phase === "capturing" && <p className="text-sm font-medium animate-pulse">Capturing...</p>}
                </div>
              </div>
            </>
          )}

          {phase === "error" && (
            <div className="text-center p-6 flex flex-col items-center justify-center h-full">
              <Camera className="w-12 h-12 text-slate-500 mb-4 opacity-50" />
              <p className="text-sm text-slate-400 mb-4">Camera access was denied or is unavailable.</p>
              <Button onClick={startCamera} variant="outline" className="text-xs">Try Again</Button>
            </div>
          )}

          {capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <img src={capturedImage} alt="Captured Profile" className="w-full h-full object-cover scale-x-[-1]" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center flex-col p-6 animate-in fade-in">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-4" />
                <p className="text-white font-medium mb-6">Profile Picture Captured!</p>
                <Button onClick={startCamera} disabled={isSaving} variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20">
                  <RotateCcw className="w-4 h-4 mr-2" /> Retake Photo
                </Button>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!capturedImage || isSaving}
            className="bg-[#0C2340] hover:bg-[#1a3a5c] text-white"
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isSaving ? "Saving..." : "Save Picture"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
