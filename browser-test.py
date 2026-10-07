"""Real-browser checks for Slip (headless Chromium at phone sizes).
Run: python3 browser-test.py   (needs: pip install playwright && playwright install chromium)
"""
import functools, http.server, os, socketserver, threading, sys
from playwright.sync_api import sync_playwright
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
httpd=socketserver.TCPServer(("127.0.0.1",0),functools.partial(Q,directory=os.path.dirname(os.path.abspath(__file__)))); URL="http://127.0.0.1:%d/index.html"%httpd.server_address[1]
threading.Thread(target=httpd.serve_forever,daemon=True).start()
res=[]
def ok(n,c,e=""): res.append(bool(c)); print(("PASS " if c else "FAIL ")+n+("" if c else " :: "+str(e)))
RECTS="""()=>{const r=e=>{const b=e.getBoundingClientRect();return [Math.round((b.left+scrollX)*10)/10,Math.round((b.top+scrollY)*10)/10,Math.round(b.width*10)/10]};return {a:[...document.querySelectorAll('.arrow')].map(r),l:[...document.querySelectorAll('.lockbtn')].map(r)}}"""
def lab(m):
    k,i,d=m[0],int(m[1]),m[2]
    return ("Slide row %d %s"%(i+1,"right" if d=="+" else "left")) if k=="r" else ("Slide column %d %s"%(i+1,"down" if d=="+" else "up"))
with sync_playwright() as p:
    b=p.chromium.launch()
    def pf(w,h=600,init=None):
        c=b.new_context(viewport={"width":w,"height":h},device_scale_factor=2,has_touch=True,is_mobile=True)
        if init: c.add_init_script(init)
        pg=c.new_page(); pg.errs=[]; pg.on("pageerror",lambda e:pg.errs.append(str(e))); pg.route("**/sw.js",lambda r:r.abort()); return pg
    for w in (320,360,390,412):
        pg=pf(w); pg.goto(URL); pg.wait_for_timeout(300)
        i=pg.evaluate("""()=>{const t=[...document.querySelectorAll('.field .tile')];const vis=t.every(x=>{const b=x.getBoundingClientRect();return document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)===x});
          const q=s=>Math.round(document.querySelector(s).getBoundingClientRect().bottom);
          return {n:t.length,vis,text:t.map(x=>x.textContent).join(''),par:document.getElementById('par').textContent,sw:document.documentElement.scrollWidth,vw:innerWidth,lowest:Math.max(q('#undo'),q('#check'),q('#hint'),q('#giveup')),vh:innerHeight}}""")
        ok("%dpx: tiles visible, letters shown, no sideways scroll, every button on a 600px-high screen"%w, i['n']==16 and i['vis'] and len(i['text'])==16 and i['par']!='0' and i['sw']<=i['vw'] and i['lowest']<=i['vh'] and not pg.errs, (i,pg.errs))
        pg.context.close()
    pg=pf(360); pg.route("**/core.js*",lambda r:r.fulfill(status=200,content_type="application/javascript",body="window.Core={VERSION:'old'};")); pg.goto(URL); pg.wait_for_timeout(300)
    m=pg.evaluate("[document.getElementById('msg').className,document.getElementById('msg').textContent]"); ok("old core.js shows a red message",m[0]=='fatal' and 'do not match' in m[1],m); pg.context.close()
    pg=pf(360); pg.goto(URL); pg.wait_for_timeout(300)
    r0=pg.evaluate(RECTS); pg.click('[aria-label="Slide row 2 right"]'); pg.wait_for_timeout(70); r1=pg.evaluate(RECTS)
    ok("arrows and lock icons stay still during a slide",r0==r1); pg.context.close()
    pg=pf(360); pg.goto(URL); pg.wait_for_timeout(300)
    for m in pg.evaluate("puzzle.solution"): pg.click('[aria-label="%s"]'%lab(m)); pg.wait_for_timeout(230)
    s=pg.evaluate("({solved:Core.isSolved(S.grid,puzzle.words,puzzle.alts),over:S.over,won:S.won,fb:S.feedback,dlg:document.getElementById('dlg').open,done:document.querySelectorAll('.tile.done').length,checks:S.checks,msg:document.getElementById('msg').textContent})")
    ok("rows spell the words but the game does not end or announce it",s['solved'] and not s['over'] and not s['won'] and s['fb'] is None and not s['dlg'] and s['done']==0 and s['checks']==0 and 'olved' not in s['msg'],s)
    pg.click('#check'); pg.wait_for_timeout(1300)
    s=pg.evaluate("({over:S.over,won:S.won,dlg:document.getElementById('dlg').open,share:document.getElementById('sh').textContent})")
    ok("pressing Check wins",s['over'] and s['won'] and s['dlg'] and 'no locks' in s['share'],s); pg.context.close()
    pg=pf(360); pg.goto(URL); pg.wait_for_timeout(300); pg.click('#check'); pg.click('#check'); pg.click('#check'); pg.wait_for_timeout(200)
    ok("three wrong checks end the game",pg.evaluate("S.over && !S.won")); pg.context.close()
    pg=pf(360); pg.goto(URL); pg.wait_for_timeout(300); pg.click('[aria-label="Lock row 3"]'); pg.click('[aria-label="Lock column 2"]')
    ok("locks freeze seven cells",pg.evaluate("document.querySelectorAll('.field .tile.locked').length")==7); pg.context.close()
    today="(()=>{const d=new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())})()"
    for name,expr in {"easy-mode save":"{date:T,id:ID,grid:G,moves:['r0+'],checks:1,locks:[0],lockPoints:[0],over:false,won:false}","first-build save":"{date:T,id:ID,grid:G,moves:[],checks:0,feedback:null,over:false,won:false}","garbage":"'x'"}.items():
        pg=pf(360,init="(()=>{const T=%s;const ID='slip-14';const G='LDHOCARCWEAMOOLT';localStorage.setItem('slip:state',JSON.stringify(%s))})()"%(today,expr)); pg.goto(URL); pg.wait_for_timeout(300)
        ok("old save (%s) still draws"%name,pg.evaluate("document.querySelectorAll('.field .tile').length")==16 and pg.evaluate("document.getElementById('par').textContent")!='0' and not pg.errs,pg.errs); pg.context.close()
    b.close()
print("\n%d checks, %d failed"%(len(res),res.count(False))); sys.exit(1 if False in res else 0)
