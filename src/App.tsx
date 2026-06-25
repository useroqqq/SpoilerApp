import { useState } from 'react';
import { Image as ImageIcon, EyeOff, Send, X, ShieldAlert, Plus } from 'lucide-react';
import { getWebxdc } from './webxdc';
import JSZip from 'jszip';

// Helper to resize image for the inner HTML
function resizeImage(file: File, maxWidth = 1200, maxHeight = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
           ctx.drawImage(img, 0, 0, width, height);
           resolve(canvas.toDataURL('image/jpeg', 0.8));
        } else {
           resolve(e.target?.result as string); // fallback
        }
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper to create a blurred thumbnail for the chat list
function createIcon(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 600;
        let width = img.width;
        let height = img.height;
        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
           ctx.filter = 'blur(25px) saturate(200%)';
           ctx.drawImage(img, -40, -40, width + 80, height + 80); // draw slightly larger to hide edge artifacts from blur
           
           // Overlay darkening
           ctx.filter = 'none';
           ctx.fillStyle = 'rgba(0,0,0,0.2)';
           ctx.fillRect(0, 0, width, height);
           
           // Draw fake sparkles
           ctx.fillStyle = 'rgba(255,255,255,0.7)';
           const numSparkles = (width * height) / 400; // density based on area
           for (let i = 0; i < numSparkles; i++) {
             ctx.fillRect(Math.random() * width, Math.random() * height, 1.5, 1.5);
           }
           
           canvas.toBlob((blob) => {
             if (blob) resolve(blob);
             else reject(new Error('Canvas to blob failed'));
           }, 'image/jpeg', 0.8);
        } else {
           reject(new Error('No canvas context'));
        }
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const TEMPLATE_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content"/>
<title>Spoiler</title>
<style>
  body, html { margin: 0; padding: 0; min-height: 100%; background: #000; user-select: none; -webkit-user-select: none; }
  .container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 1rem; padding: 1rem; box-sizing: border-box; }
  .image-wrapper { position: relative; width: 100%; display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; border-radius: 8px; }
  img { max-width: 100%; max-height: 100vh; object-fit: contain; transition: filter 0.4s ease-out, transform 0.4s ease-out; }
  .hidden-img { filter: blur(25px) saturate(200%); transform: scale(1.1); }
  .revealed-img { filter: blur(0px) saturate(100%); transform: scale(1); }
  
  @keyframes shimmer {
    0% { background-position: 0px 0px; }
    20% { background-position: 23px 41px; }
    40% { background-position: -17px -33px; }
    60% { background-position: 51px 19px; }
    80% { background-position: -37px 53px; }
    100% { background-position: 0px 0px; }
  }
  .spoiler-overlay {
    position: absolute;
    inset: -20px;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 12 0 0 0 -6'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    animation: shimmer 3.0s steps(1) infinite;
    opacity: 0.8;
    pointer-events: none;
    z-index: 10;
    transition: opacity 0.4s ease-out;
  }
  .revealed-overlay {
    opacity: 0;
  }
</style>
<script src="webxdc.js"></script>
</head>
<body>
  <div class="container" id="container">
    __IMAGES_HTML__
  </div>
  <script>
    document.querySelectorAll('.image-wrapper').forEach(wrapper => {
      wrapper.onclick = function() {
        const img = this.querySelector('img');
        const overlay = this.querySelector('.spoiler-overlay');
        if (img && overlay) {
          if (img.className === 'hidden-img') {
             img.className = 'revealed-img';
             overlay.className = 'spoiler-overlay revealed-overlay';
          } else {
             img.className = 'hidden-img';
             overlay.className = 'spoiler-overlay';
          }
        }
      };
    });
  </script>
</body>
</html>`;

export default function App() {
  const webxdc = getWebxdc();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...imageFiles]);
      const newUrls = imageFiles.map(f => URL.createObjectURL(f));
      setPreviewUrls(prev => [...prev, ...newUrls]);
    }
    // reset input value so the same file can be selected again
    e.target.value = '';
  };

  const clearSelection = () => {
    setSelectedFiles([]);
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    setSuccessMessage(null);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSend = async () => {
    if (selectedFiles.length === 0) return;
    setIsSending(true);
    setSuccessMessage(null);

    try {
      // 1. Prepare image contents
      const base64Images = await Promise.all(selectedFiles.map(file => resizeImage(file)));
      const iconBlob = await createIcon(selectedFiles[0]);
      
      // 2. Build index.html
      const imagesHtml = base64Images.map(imgData => `
        <div class="image-wrapper">
          <img src="${imgData}" class="hidden-img" draggable="false" />
          <div class="spoiler-overlay"></div>
        </div>
      `).join('');
      const indexHtml = TEMPLATE_HTML.replace('__IMAGES_HTML__', imagesHtml);
      
      // 3. Create zip file
      const zip = new JSZip();
      zip.file('index.html', indexHtml);
      zip.file('icon.jpg', iconBlob);
      zip.file('manifest.toml', `name = "Spoiler"\nsource_code_url = ""`);
      
      // 4. Generate zip blob
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      
      // 5. Send to chat
      await webxdc.sendToChat({
        file: {
          name: `ChatSpoiler.xdc`,
          blob: zipBlob
        }
      });

      // Show success briefly
      setSuccessMessage('Spoiler sent to chat!');
      setTimeout(() => {
        clearSelection();
      }, 2000);
    } catch (err) {
      console.error("Failed to generate spoiler", err);
      setSuccessMessage("Error creating spoiler.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-slate-50 font-sans shadow-xl border-x border-slate-200">
      <style>{`
        @keyframes shimmer {
          0% { background-position: 0px 0px; }
          20% { background-position: 23px 41px; }
          40% { background-position: -17px -33px; }
          60% { background-position: 51px 19px; }
          80% { background-position: -37px 53px; }
          100% { background-position: 0px 0px; }
        }
        .spoiler-overlay {
          position: absolute;
          inset: -20px;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 12 0 0 0 -6'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          animation: shimmer 3.0s steps(1) infinite;
          opacity: 0;
          pointer-events: none;
          z-index: 10;
          transition: opacity 0.3s ease-out;
        }
        .group:hover .spoiler-overlay {
          opacity: 0.8;
        }
      `}</style>
      <header className="flex items-center gap-3 bg-white px-4 py-4 border-b border-slate-200 shadow-sm shrink-0">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-bold text-slate-800 tracking-wider">SPOILER</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
        {previewUrls.length === 0 ? (
          <label className="flex flex-col items-center justify-center w-full max-w-sm aspect-square bg-white border-2 border-dashed border-slate-300 rounded-3xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group shadow-sm">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 rounded-full flex items-center justify-center mb-4 transition-colors">
              <ImageIcon className="w-8 h-8" />
            </div>
            <span className="font-medium text-slate-700 group-hover:text-blue-700 transition-colors text-lg">Select photos</span>
            <span className="text-sm text-slate-400 mt-2 text-center px-4">They will be hidden in the chat and revealed only on tap</span>
            <input 
              type="file" 
              accept="image/*" 
              multiple
              className="hidden" 
              onChange={handleFileSelect} 
            />
          </label>
        ) : (
          <div className="w-full flex flex-col items-center animate-in fade-in zoom-in duration-300 h-full justify-between pb-8">
            {successMessage && (
              <div className="w-full max-w-md mb-4 p-3 rounded-xl bg-green-100 text-green-700 text-center font-medium shadow-sm border border-green-200 shrink-0">
                {successMessage}
              </div>
            )}
            
            <div className="w-full flex-1 overflow-y-auto min-h-0 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 auto-rows-max px-2">
                {previewUrls.map((url, i) => (
                  <div key={i} className="relative w-full aspect-square bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center overflow-hidden">
                    <button 
                      onClick={() => removeFile(i)}
                      className="absolute top-2 right-2 bg-slate-800/80 hover:bg-slate-900 text-white p-1.5 rounded-full transition-colors z-20 shadow-md backdrop-blur-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="relative w-full h-full p-2">
                      <div className="group w-full h-full bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center relative">
                        <img src={url} alt={`Preview ${i+1}`} className="max-w-full max-h-full object-contain transition-all duration-300 group-hover:blur-[25px] group-hover:saturate-200 group-hover:scale-110" />
                        <div className="spoiler-overlay"></div>
                      </div>
                    </div>
                  </div>
                ))}
                
                <label className="w-full aspect-square bg-white border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all flex flex-col items-center justify-center shadow-sm">
                  <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-2">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium text-slate-600">Add more</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple
                    className="hidden" 
                    onChange={handleFileSelect} 
                  />
                </label>
              </div>
            </div>

            <button 
              onClick={handleSend}
              disabled={isSending}
              className={`shrink-0 w-full max-w-md flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-lg transition-all shadow-md ${
                isSending 
                  ? 'bg-blue-400 text-white cursor-wait' 
                  : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0'
              }`}
            >
              {isSending ? (
                <span className="animate-pulse">Sending...</span>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send to chat
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
