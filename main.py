import instaloader

L = instaloader.Instaloader()

url = "https://www.instagram.com/reels/DU3c_csjdXo/"

shortcode = url.split("/")[-2]

post = instaloader.Post.from_shortcode(L.context, shortcode)

L.download_post(post, target="indirilenler")