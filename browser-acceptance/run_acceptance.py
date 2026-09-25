"""browser-acceptance 运行器：对隔离环境执行一条自然语言验收任务，产出可复跑证据。

用法（用 BA_ROOT/jev-ultrafast/.venv 的 python 跑，见 README）：

    python run_acceptance.py --url http://127.0.0.1:8901/fixture.html \
        --goal "Open the Casa Flora listing. Stop when its detail page is visible." \
        --allow-host 127.0.0.1 --expect-url-contains casa-flora

红线（方案 §4 Security，主人 2026-09-25 确认）：
- --allow-host 为强制参数；url 主机不在白名单内拒绝启动。白名单只应包含隔离环境/夹具。
- 独立校验（--expect-*）至少一项必填：模型的 DONE 自报不算证据，最终状态由本运行器独立判定。
"""
import argparse
import json
import os
import sys
import time
from urllib.parse import urlparse

BA_ROOT = os.environ.get("BA_ROOT", os.path.expanduser("~/.browser-acceptance"))
JEV_DIR = os.environ.get("BA_JEV_DIR", os.path.join(BA_ROOT, "jev-ultrafast"))


def main():
    p = argparse.ArgumentParser(description="browser-acceptance runner")
    p.add_argument("--url", required=True)
    p.add_argument("--goal", required=True)
    p.add_argument("--allow-host", required=True,
                   help="逗号分隔的主机白名单；只应包含隔离环境/夹具主机")
    p.add_argument("--expect-url-contains")
    p.add_argument("--expect-title-contains")
    p.add_argument("--expect-text-contains")
    p.add_argument("--out", default=None, help="证据目录，默认 $BA_ROOT/evidence/<时间戳>")
    p.add_argument("--max-steps", type=int, default=25)
    p.add_argument("--screenshots", action="store_true")
    a = p.parse_args()

    host = urlparse(a.url).hostname or ""
    allow = [h.strip() for h in a.allow_host.split(",") if h.strip()]
    if host not in allow:
        print(f"REFUSED: {host} 不在 --allow-host 白名单 {allow} 内。本工具只允许验收隔离环境/夹具。")
        return 2
    if not any([a.expect_url_contains, a.expect_title_contains, a.expect_text_contains]):
        print("REFUSED: 至少一项 --expect-* 独立校验必填（DONE 自报不算证据）。")
        return 2

    print(f"写路径声明：本次验收仅作用于白名单主机 {allow}；")
    print(f"若任务成功，改变的是这些主机上的页面状态。非隔离环境请勿运行。")

    os.environ.setdefault("BU_CDP_URL", "http://127.0.0.1:9222")
    os.environ.setdefault("TYPESAFE_BASE_URL", "http://127.0.0.1:8791")
    os.environ.setdefault("TYPESAFE_API_KEY", "local")
    os.environ.setdefault("TEXT_MODEL_API_KEY", os.environ.get("DEEPSEEK_API_KEY", ""))
    os.environ.setdefault("TEXT_MODEL_BASE_URL", "https://api.deepseek.com/v1")
    os.environ.setdefault("TEXT_MODEL", "deepseek-chat")
    sys.path.insert(0, JEV_DIR)
    from jev_ultrafast import Agent

    out = a.out or os.path.join(BA_ROOT, "evidence", time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    status, page = "error", None
    try:
        with Agent(a.url, a.goal, screenshots=a.screenshots) as agent:
            print("elements on first page:", len(agent.snapshot()["elements"]),
                  "| title:", agent.state["page"]["title"])
            for state in agent.run():
                h = state["history"][-1] if state["history"] else None
                d = state["decisions"][-1] if state["decisions"] else None
                print(f"{state['elapsed_ms']:6d} ms  status={state['status']:9s} "
                      f"op={d['operation'] if d else None:9s} conf={d['confidence'] if d else 0:.2f} "
                      f"action={h['action'][:60] if h else None}")
                if len(state["history"]) >= a.max_steps:
                    break
            status, page = state["status"], state["page"]
            trace = {"goal": a.goal, "url": a.url, "history": state["history"],
                     "decisions": [{k: v for k, v in d.items() if k != "request"}
                                   for d in state["decisions"]],
                     "text_calls": state["text_calls"]}
    except Exception as e:
        status, trace = f"error:{type(e).__name__}", {"error": str(e)}
    wall = time.time() - t0

    verdict = {"status": status, "wall_s": round(wall, 1), "checks": {}, "pass": False}
    if page:
        if a.expect_url_contains:
            verdict["checks"]["url_contains"] = a.expect_url_contains in page["url"]
        if a.expect_title_contains:
            verdict["checks"]["title_contains"] = a.expect_title_contains in page["title"]
        if a.expect_text_contains:
            verdict["checks"]["text_contains"] = a.expect_text_contains in page.get("text", "")
        verdict["pass"] = status == "done" and all(verdict["checks"].values())
        verdict["final"] = {"url": page["url"], "title": page["title"]}
    json.dump(trace, open(os.path.join(out, "trace.json"), "w"), indent=1, ensure_ascii=False)
    json.dump(verdict, open(os.path.join(out, "verdict.json"), "w"), indent=1, ensure_ascii=False)
    print(f"VERDICT: {'PASS' if verdict['pass'] else 'FAIL'}  status={status} "
          f"checks={verdict['checks']}  evidence={out}")
    return 0 if verdict["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
