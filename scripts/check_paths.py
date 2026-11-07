import re
with open("/app/.next/server/app/login.html") as f:
    c = f.read()
sources = re.findall(r'src="([^"]+)"', c)
for s in sources[:5]:
    print(s)