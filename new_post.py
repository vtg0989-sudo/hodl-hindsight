#!/usr/bin/env python3
"""Add a blog post to this site.

Usage: python3 new_post.py YYYY-MM-DD slug "Title" "One-sentence excerpt" body.html

body.html holds the post body as HTML (<p>, <h2>, <ul>, <a> only).
Writes blog/<date>-<slug>.html, adds the post to the lists on index.html and
blog/index.html (newest first), and rebuilds sitemap.xml.
"""
import sys, os, re, html, datetime, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
CFG = dict(l.split('=',1) for l in open(os.path.join(ROOT,'site.cfg')).read().split('\n') if '=' in l)
BASE = CFG['base_url'].rstrip('/') + '/'

def head(root, title, desc):
    h = open(os.path.join(ROOT,'_head.html')).read().replace('{root}', root)
    h = re.sub(r'<title>.*?</title>', f'<title>{html.escape(title)}</title>', h)
    h = re.sub(r'<meta property="og:url" content="[^"]*">\n?', '', h)
    h = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{html.escape(title)}">', h)
    h = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{html.escape(desc)}">', h)
    return re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{html.escape(desc)}">', h)

def item(date, href, title, excerpt):
    d = datetime.date.fromisoformat(date)
    return (f'<article class="post-item"><time datetime="{date}">{d.strftime("%b %-d, %Y")}</time>'
            f'<h3><a href="{href}">{html.escape(title)}</a></h3><p>{html.escape(excerpt)}</p></article>')

def insert(path, entry, limit=None):
    s = open(path).read()
    m = re.search(r'(<!-- POSTS:START -->)(.*?)(<!-- POSTS:END -->)', s, re.S)
    items = re.findall(r'<article class="post-item">.*?</article>', m.group(2), re.S)
    items = [entry] + [i for i in items if i != entry]
    if limit: items = items[:limit]
    s = s[:m.start()] + m.group(1) + '\n' + '\n'.join(items) + '\n' + m.group(3) + s[m.end():]
    open(path, 'w').write(s)

def sitemap():
    urls = ['', 'blog/', 'privacy.html'] + sorted(os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT,'blog','*.html')) if not p.endswith('index.html'))
    open(os.path.join(ROOT,'sitemap.xml'),'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'<url><loc>{BASE}{u}</loc></url>\n' for u in urls) + '</urlset>\n')

def main():
    date, slug, title, excerpt, body_file = sys.argv[1:6]
    datetime.date.fromisoformat(date)
    assert re.fullmatch(r'[a-z0-9-]+', slug), 'slug: lowercase letters, digits, hyphens'
    body = open(body_file).read().strip()
    fname = f'{date}-{slug}.html'
    d = datetime.date.fromisoformat(date)
    page = (head('../', f'{title} | {CFG["site_name"]}', excerpt) +
      f'<div class="wrap post-page"><nav class="crumbs"><a href="../">{html.escape(CFG["site_name"])}</a> / <a href="./">{html.escape(CFG["blog_name"])}</a></nav>\n'
      f'<article class="post"><time datetime="{date}">{d.strftime("%b %-d, %Y")}</time><h1>{html.escape(title)}</h1>\n{body}\n</article>\n'
      f'<p class="back"><a href="./">More from the {html.escape(CFG["blog_name"].lower())}</a></p></div>\n'
      + open(os.path.join(ROOT,'_footer.html')).read().replace('{root}','../') + '</body>\n</html>\n')
    open(os.path.join(ROOT,'blog',fname),'w').write(page)
    insert(os.path.join(ROOT,'index.html'), item(date, f'blog/{fname}', title, excerpt), limit=5)
    insert(os.path.join(ROOT,'blog','index.html'), item(date, fname, title, excerpt))
    sitemap()
    print('added', fname)

if __name__ == '__main__': main()
