#!/usr/bin/env python3
"""
GPT Recenzent — świeże spojrzenie GPT na każdą zmianę w kodzie.

Tryby:
  * GitHub Actions (automat): recenzuje push albo Pull Request i wkleja komentarz.
  * Lokalnie:  python3 recenzja.py            -> niezacommitowane zmiany
               python3 recenzja.py main       -> wszystko względem gałęzi main

Wymaga tylko Pythona 3 (bez dodatkowych bibliotek) i zmiennej OPENAI_API_KEY.
Model wybiera się sam (najnowszy dostępny GPT); wymuszenie: zmienna OPENAI_MODEL.
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
API = "https://api.openai.com/v1"
MAX_DIFF = int(os.environ.get("MAX_DIFF_CHARS") or "120000")
ZASADY_GLOBALNE = os.environ.get("ZASADY_GLOBALNE") or str(HERE / "ZASADY.md")
# zasady konkretnego projektu: pierwszy istniejący z tych plików w katalogu repozytorium
ZASADY_PROJEKTU = ("ZASADY-PROJEKTU.md", "CLAUDE.md")
# preferowane modele (od najlepszego); gdy żadnego nie ma, bierzemy najnowszy model "gpt-…"
PREFEROWANE = ("gpt-6-astra", "gpt-6-sol", "gpt-5.6-sol", "gpt-5.5", "gpt-5.4")
POMIJANE = ("mini", "nano", "audio", "realtime", "image", "tts", "transcribe", "search", "embed", "instruct", "codex")
# pliki, których nie ma sensu recenzować
WYKLUCZONE = (":(exclude)package-lock.json", ":(exclude)*.lock", ":(exclude)*.min.js",
              ":(exclude)*.apk", ":(exclude)*.keystore", ":(exclude)dist/**", ":(exclude)*.svg")

SYSTEM = """Jesteś doświadczonym, niezależnym recenzentem kodu. Widzisz te zmiany pierwszy raz \
i nie znasz rozmowy, w której powstały — Twoja rola to świeże spojrzenie z zewnątrz.

Szukaj przede wszystkim:
- błędów logicznych i przypadków brzegowych,
- problemów z bezpieczeństwem (klucze w kodzie, brak walidacji, wycieki danych),
- brakującej obsługi błędów i miejsc, które mogą się wysypać na telefonie lub urządzeniu,
- niezgodności z zasadami projektu podanymi niżej,
- problemów z wydajnością i niepotrzebnej złożoności,
- brakujących testów dla ważnej logiki.

Najcenniejsze są uwagi, na które autor sam by nie wpadł: założenia przyjęte bez sprawdzenia,
scenariusze, o których nikt nie pomyślał, prostsze lub lepsze podejście do całego problemu.
Na końcu dodaj sekcję "💡 Inne spojrzenie" z 1–3 takimi myślami (albo pomiń ją, jeśli nie masz nic wartościowego).

Jak odpowiadać:
- Pisz po polsku, zwięźle i konkretnie.
- Każda uwaga: plik i fragment/linia, na czym polega problem, jak to poprawić.
- Uporządkuj według wagi: 🔴 Krytyczne, 🟠 Ważne, 🟡 Drobne.
- Nie chwal i nie streszczaj zmian. Nie wymyślaj problemów na siłę.
- Jeśli czegoś nie jesteś pewien (bo nie widzisz reszty kodu), napisz to wprost.
- Jeśli nie widzisz istotnych problemów, napisz krótko: "Brak istotnych uwag."
"""


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.stdout


def has_commit(ref):
    return subprocess.run(["git", "cat-file", "-e", f"{ref}^{{commit}}"], capture_output=True).returncode == 0


def read(path):
    p = pathlib.Path(path)
    return p.read_text(encoding="utf-8") if p.is_file() else ""


def get_diff():
    base = os.environ.get("BASE_SHA", "").strip()
    head = os.environ.get("HEAD_SHA", "").strip()
    if head:  # GitHub Actions
        if not base or set(base) == {"0"} or not has_commit(base):  # nowa gałąź / brak historii
            base = f"{head}~1" if has_commit(f"{head}~1") else ""
        if not base:
            return git("show", "--format=", "--unified=5", head, "--", ".", *WYKLUCZONE)
        return git("diff", "--unified=5", f"{base}..{head}", "--", ".", *WYKLUCZONE)
    # tryb lokalny
    if len(sys.argv) > 1:
        ref = sys.argv[1]
        return git("diff", "--unified=5", f"{ref}...HEAD", "--", ".", *WYKLUCZONE) + \
            git("diff", "--unified=5", "HEAD", "--", ".", *WYKLUCZONE)
    return git("diff", "--unified=5", "HEAD", "--", ".", *WYKLUCZONE)


def _request(path, key, body=None, timeout=600):
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def pick_model(key):
    """Wybiera model: OPENAI_MODEL, albo preferowany, albo najnowszy dostępny GPT."""
    forced = os.environ.get("OPENAI_MODEL", "").strip()
    if forced:
        return forced
    try:
        models = _request("/models", key, timeout=60)["data"]
    except Exception:
        return PREFEROWANE[0]
    ids = {m["id"] for m in models}
    for name in PREFEROWANE:
        if name in ids:
            return name
    gpt = [m for m in models if m["id"].startswith("gpt-") and not any(s in m["id"] for s in POMIJANE)]
    gpt.sort(key=lambda m: m.get("created", 0), reverse=True)
    return gpt[0]["id"] if gpt else PREFEROWANE[0]


def ask_gpt(prompt):
    """Zwraca (recenzja, model)."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("Brak OPENAI_API_KEY.")
    model = pick_model(key)
    body = {"model": model, "messages": [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": prompt},
    ]}
    try:
        data = _request("/chat/completions", key, body)
        return data["choices"][0]["message"]["content"].strip(), model
    except urllib.error.HTTPError as e:
        sys.exit(f"Błąd OpenAI ({e.code}, model {model}): {e.read().decode(errors='replace')[:1000]}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        sys.exit(f"Brak połączenia z OpenAI: {e}")
    except (KeyError, IndexError, ValueError, TypeError, AttributeError) as e:
        # np. pusta treść (content = null), gdy model odmówi odpowiedzi
        sys.exit(f"Nieoczekiwana odpowiedź OpenAI: {e!r}")


def project_rules(project_dir):
    for name in ZASADY_PROJEKTU:
        text = read(pathlib.Path(project_dir, name))
        if text:
            return text
    return ""


def build_prompt(diff, project_dir="."):
    """Zwraca (prompt, notatka). Przycina zbyt duże zmiany."""
    note = ""
    if len(diff) > MAX_DIFF:
        diff = diff[:MAX_DIFF]
        note = "\n\n_Uwaga: zmiana była duża — recenzent widział tylko jej początek._"
    zasady = read(ZASADY_GLOBALNE)
    projekt = project_rules(project_dir)
    prompt = (
        f"## Stałe zasady użytkownika (obowiązują we wszystkich projektach)\n{zasady or '(brak)'}\n\n"
        f"## Zasady i notatki tego projektu\n{projekt or '(brak)'}\n\n"
        f"## Zmiany do recenzji (git diff)\n```diff\n{diff}\n```"
    )
    return prompt, note


def post_to_github(text):
    repo = os.environ["GITHUB_REPOSITORY"]
    token = os.environ["GITHUB_TOKEN"]
    pr = os.environ.get("PR_NUMBER", "").strip()
    if pr:
        url = f"https://api.github.com/repos/{repo}/issues/{pr}/comments"
    else:
        url = f"https://api.github.com/repos/{repo}/commits/{os.environ['HEAD_SHA']}/comments"
    req = urllib.request.Request(
        url,
        data=json.dumps({"body": text[:65000]}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as e:
        print(f"Nie udało się dodać komentarza ({e.code}): {e.read().decode(errors='replace')[:500]}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"Nie udało się dodać komentarza: {e}")


def mask_key(text):
    """Usuwa klucz z komunikatu: najpierw dokładną wartość, potem wszystko w formacie sk-…"""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        text = text.replace(key, "sk-…")
    return re.sub(r"sk-[A-Za-z0-9_\-*]+", "sk-…", text)


def main():
    in_actions = os.environ.get("GITHUB_ACTIONS") == "true"
    if in_actions and not os.environ.get("OPENAI_API_KEY"):
        # brak klucza nie może psuć buildów — tylko ostrzeżenie w logu
        print("::warning::Brak sekretu OPENAI_API_KEY — recenzja GPT pominięta.")
        return

    diff = get_diff()
    if not diff.strip():
        print("Brak zmian do recenzji.")
        return

    prompt, note = build_prompt(diff)
    try:
        review, model = ask_gpt(prompt)
    except SystemExit as e:
        msg = mask_key(str(e))
        print(f"::error::Recenzja GPT nie powiodła się: {msg}")
        if in_actions:
            post_to_github(f"### ⚠️ Recenzja GPT nie powiodła się\n\n```\n{msg[:1500]}\n```")
        sys.exit(1)
    text = f"### 🔍 Recenzja GPT ({model})\n\n{review}{note}"

    if in_actions:
        post_to_github(text)
    print(text)


if __name__ == "__main__":
    main()
