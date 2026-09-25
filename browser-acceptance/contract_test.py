"""systemone 端点契约测试：本地 Laya 服务的应答必须满足 jev 的校验约束。

前置：stack 已启动（start-stack.sh）。用 BA_ROOT/jev-ultrafast/.venv 的 python 跑。
校验规则直接复用 jev_ultrafast.model.validate_choice（单一事实源，不复制逻辑）：
- choice 必须在候选 id 内；probabilities 键集 == 候选集；概率∈[0,1] 且和≈1；choice 是最大概率项。
- 畸形请求必须 400，且不得执行任何动作（服务端错误路径）。
"""
import json
import math
import os
import sys
import urllib.request

BA_ROOT = os.environ.get("BA_ROOT", os.path.expanduser("~/.browser-acceptance"))
JEV_DIR = os.environ.get("BA_JEV_DIR", os.path.join(BA_ROOT, "jev-ultrafast"))
S1 = os.environ.get("TYPESAFE_BASE_URL", "http://127.0.0.1:8791").rstrip("/") + "/v1/systemone"
sys.path.insert(0, JEV_DIR)
from jev_ultrafast.model import validate_choice  # noqa: E402


def post(body):
    req = urllib.request.Request(S1, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main():
    sample_path = os.path.join(BA_ROOT, "laya-browser", "code", "sample_request.json")
    req = json.load(open(sample_path))
    failures = []

    code, r = post({"model": "laya-browser/v10s", "state": req["state"], "questions": req["questions"]})
    if code != 200:
        failures.append(f"正常请求返回 {code}: {str(r)[:200]}")
    else:
        for k in ("answers", "model", "usage"):
            if k not in r:
                failures.append(f"响应缺字段 {k}")
        for qid, q in req["questions"].items():
            ans = r.get("answers", {}).get(qid)
            if q.get("type") != "choice":
                continue
            ids = set(q["criteria"])
            try:
                validate_choice(ans, ids)  # 不合法即 raise——与 jev 同一约束
            except Exception as e:
                failures.append(f"answers.{qid} 不满足 validate_choice: {e}")

    code, r = post({"state": {}, "questions": "not-a-dict"})
    if code == 200:
        failures.append("畸形请求返回 200（应 4xx，不得静默成功）")

    # 运行器拒绝路径（无需浏览器/服务）：无白名单、主机不在白名单、无独立校验，都必须拒绝启动
    import subprocess
    runner = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run_acceptance.py")
    refusal_cases = [
        (["--url", "http://127.0.0.1:8901/fixture.html", "--goal", "x", "--expect-url-contains", "y"],
         "缺 --allow-host"),
        (["--url", "https://example.com/", "--goal", "x", "--allow-host", "127.0.0.1",
          "--expect-url-contains", "y"], "主机不在白名单"),
        (["--url", "http://127.0.0.1:8901/fixture.html", "--goal", "x", "--allow-host", "127.0.0.1"],
         "缺 --expect-* 独立校验"),
    ]
    for args, label in refusal_cases:
        r = subprocess.run([sys.executable, runner, *args], capture_output=True, text=True, timeout=60)
        if r.returncode != 2:
            failures.append(f"运行器拒绝路径「{label}」退出码 {r.returncode}（应 2）：{r.stdout[:80]}{r.stderr[:80]}")

    if failures:
        print("CONTRACT FAIL:")
        for f in failures:
            print(" -", f)
        return 1
    print(f"CONTRACT PASS: systemone @ {S1} 满足 jev validate_choice 约束；畸形请求被拒；"
          f"运行器三条拒绝路径（无白名单/主机越界/无独立校验）全部拦截。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
