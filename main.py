import customtkinter as ctk
import instaloader
import threading
import os
import re

class ReelsDownloaderApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("🐱 Kitty Reels Downloader")
        self.geometry("600x500")
        
        # Set appearance
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # UI Layout
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Header
        self.label = ctk.CTkLabel(self, text="Instagram Reels Downloader", font=ctk.CTkFont(size=24, weight="bold"))
        self.label.grid(row=0, column=0, padx=20, pady=(20, 10))

        # Instructions
        self.inst_label = ctk.CTkLabel(self, text="Enter Reels URLs (one per line):", font=ctk.CTkFont(size=14))
        self.inst_label.grid(row=1, column=0, padx=20, pady=(0, 10), sticky="w")

        # Bulk Input Text Area
        self.url_textbox = ctk.CTkTextbox(self, height=150)
        self.url_textbox.grid(row=2, column=0, padx=20, pady=10, sticky="nsew")

        # Progress Bar
        self.progress_bar = ctk.CTkProgressBar(self)
        self.progress_bar.grid(row=3, column=0, padx=20, pady=10, sticky="ew")
        self.progress_bar.set(0)

        # Download Button
        self.download_button = ctk.CTkButton(self, text="Start Download", command=self.start_download_thread)
        self.download_button.grid(row=4, column=0, padx=20, pady=10)

        # Status Log
        self.status_log = ctk.CTkTextbox(self, height=100, state="disabled")
        self.status_log.grid(row=5, column=0, padx=20, pady=(10, 20), sticky="ew")

        # Instaloader instance
        self.L = instaloader.Instaloader()
        self.download_dir = "indirilenler"

    def log_message(self, message):
        self.status_log.configure(state="normal")
        self.status_log.insert("end", f"{message}\n")
        self.status_log.see("end")
        self.status_log.configure(state="disabled")

    def start_download_thread(self):
        urls = self.url_textbox.get("1.0", "end-1c").strip().split("\n")
        urls = [url.strip() for url in urls if url.strip()]
        
        if not urls:
            self.log_message("Error: No URLs provided.")
            return

        self.download_button.configure(state="disabled")
        self.progress_bar.set(0)
        
        thread = threading.Thread(target=self.download_reels, args=(urls,))
        thread.daemon = True
        thread.start()

    def download_reels(self, urls):
        total = len(urls)
        success_count = 0
        
        if not os.path.exists(self.download_dir):
            os.makedirs(self.download_dir)

        for i, url in enumerate(urls):
            self.log_message(f"Processing ({i+1}/{total}): {url}")
            try:
                # Extract shortcode
                # Match: instagram.com/reels/SHORTCODE/ or instagram.com/p/SHORTCODE/
                match = re.search(r'/(?:reels|p)/([^/?#&]+)', url)
                if not match:
                    self.log_message(f"Failed: Invalid URL format - {url}")
                    continue
                
                shortcode = match.group(1)
                post = instaloader.Post.from_shortcode(self.L.context, shortcode)
                
                self.L.download_post(post, target=self.download_dir)
                self.log_message(f"Success: {shortcode} downloaded.")
                success_count += 1
            except Exception as e:
                self.log_message(f"Error downloading {url}: {str(e)}")
            
            # Update progress
            self.progress_bar.set((i + 1) / total)

        self.log_message(f"\n--- Done ---\nSuccessfully downloaded {success_count} posts.")
        self.download_button.configure(state="normal")

if __name__ == "__main__":
    app = ReelsDownloaderApp()
    app.mainloop()
