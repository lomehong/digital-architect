"""browser-acceptance 基线套件：回归验证部署后的能力不漂移。

用法（前置：stack 已启动）：
    python suite.py            # REPEATS=1
    REPEATS=3 python suite.py  # 与基线口径一致

判定口径（2026-09-25 Spike 实测基线，钉死在代码里）：
- nav 任务（导航点击类）：必须全部 PASS——Spike 实测 15/15；
- known-limit 任务（搜索打字 / 视口外分页）：登记为已知限制，失败不判红，通过则报告改进；
- fixture-click（本地夹具纯点击）：必须 PASS；
- fixture-composite（本地夹具复合任务）：必须**不通过**且以 blocked/失败收场——
  守卫拦住失败任务是被锁定的正确行为；若它"通过"了，说明守卫或校验被破坏，套件判红。
网络注意：套件任务访问公网站点；主机不可达导致的 error 计为 infra 失败并显式列出。
"""
import json
import os
import sys
import time

BA_ROOT = os.environ.get("BA_ROOT", os.path.expanduser("~/.browser-acceptance"))
JEV_DIR = os.environ.get("BA_JEV_DIR", os.path.join(BA_ROOT, "jev-ultrafast"))
FIXTURE = f"http://127.0.0.1:{os.environ.get('BA_FIXTURE_PORT', '8901')}/fixture.html"

os.environ.setdefault("BU_CDP_URL", "http://127.0.0.1:9222")
os.environ.setdefault("TYPESAFE_BASE_URL", "http://127.0.0.1:8791")
os.environ.setdefault("TYPESAFE_API_KEY", "local")
os.environ.setdefault("TEXT_MODEL_API_KEY", os.environ.get("DEEPSEEK_API_KEY", ""))
os.environ.setdefault("TEXT_MODEL_BASE_URL", "https://api.deepseek.com/v1")
os.environ.setdefault("TEXT_MODEL", "deepseek-chat")
sys.path.insert(0, JEV_DIR)
from jev_ultrafast import Agent  # noqa: E402

# (name, kind, url, goal, check(url, title, text))
TASKS = [
    ("gh-issues", "nav", "https://github.com/tile-ai/tilelang", "Open the Issues tab of this repository.",
     lambda u, t, x: "/issues" in u),
    ("py-downloads", "nav", "https://www.python.org/", "Go to the Downloads page.",
     lambda u, t, x: "/downloads" in u),
    ("books-travel", "nav", "https://books.toscrape.com/", "Open the 'Travel' category.",
     lambda u, t, x: "travel" in u),
    ("books-open-book", "nav", "https://books.toscrape.com/", "Open the product page of the book 'A Light in the Attic'.",
     lambda u, t, x: "a-light-in-the-attic" in u),
    ("quotes-tag-love", "nav", "https://quotes.toscrape.com/", "Show the quotes tagged 'love'.",
     lambda u, t, x: "/tag/love" in u),
    ("books-page2", "known-limit", "https://books.toscrape.com/", "Go to page 2 of the catalogue.",
     lambda u, t, x: "page-2" in u),  # 「下一页」在首屏视口外：jev DOM 快照只收可见控件
    ("arxiv-search", "known-limit", "https://arxiv.org/", "Search arXiv for 'flash attention' papers and show the results list.",
     lambda u, t, x: "search" in u and "flash" in u.lower()),  # TYPE_TEXT 流程弱项（上游已知失败桶）
    ("fixture-click", "fixture-must", FIXTURE,
     "Open the Casa Flora listing. Stop when the Casa Flora detail page is visible.",
     lambda u, t, x: "casa-flora" in u),
    ("fixture-composite", "fixture-lock", FIXTURE,
     "Search for stays in Lisbon, filter to the Design category, enable Free cancellation, "
     "then open the Casa Flora listing. Stop when the Casa Flora detail page is visible.",
     lambda u, t, x: "casa-flora" in u and "Lisbon" in x),
]


def run(name, url, goal, check, max_steps=20):
    t0 = time.time()
    steps, status, page = 0, "error", None
    try:
        with Agent(url, goal) as agent:
            for state in agent.run():
                steps = len(state["history"])
                status, page = state["status"], state["page"]
                if steps >= max_steps:
                    break
            time.sleep(1.5)
            try:
                page = agent.browser.observe(screenshot=False)
            except Exception:
                pass
    except Exception as e:
        status = f"error:{type(e).__name__}"
    ok = bool(page and check(page["url"], page["title"], page.get("text", "")))
    return ok, steps, status, time.time() - t0, (page or {}).get("url", "")


def main():
    repeats = int(os.environ.get("REPEATS", "1"))
    rows = []
    for name, kind, url, goal, check in TASKS:
        for _ in range(repeats):
            ok, steps, status, wall, final = run(name, url, goal, check)
            rows.append(dict(name=name, kind=kind, ok=ok, steps=steps,
                             status=status, wall=round(wall, 1), final=final[:80]))
            print(f"{'PASS' if ok else 'FAIL'}  {name:18s} [{kind:12s}] steps={steps:2d} "
                  f"status={status:9s} {wall:5.1f}s  {final[:60]}", flush=True)

    must = [r for r in rows if r["kind"] in ("nav", "fixture-must")]
    lock = [r for r in rows if r["kind"] == "fixture-lock"]
    limits = [r for r in rows if r["kind"] == "known-limit"]
    must_fail = [r for r in must if not r["ok"]]
    lock_breach = [r for r in lock if r["ok"]]  # 复合任务"通过"= 守卫被破坏

    print()
    for r in limits:
        print(f"known-limit {r['name']}: {'改进为 PASS（请复核后更新基线）' if r['ok'] else '仍失败（符合基线）'}")
    out = os.environ.get("SUITE_OUT", os.path.join(BA_ROOT, "evidence", f"suite-{time.strftime('%Y%m%d-%H%M%S')}.json"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(rows, open(out, "w"), indent=1, ensure_ascii=False)
    print(f"留档: {out}")

    if must_fail or lock_breach:
        for r in must_fail:
            print(f"REGRESSION: {r['name']} 应过未过（{r['status']}）")
        for r in lock_breach:
            print(f"GUARD BREACH: {r['name']} 不应通过却通过了——守卫/校验被破坏")
        print("SUITE FAIL")
        return 1
    print(f"SUITE PASS: {len(must)}/{len(must)} 必过项通过；守卫锁定行为正常；"
          f"known-limit {sum(r['ok'] for r in limits)}/{len(limits)} 通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
