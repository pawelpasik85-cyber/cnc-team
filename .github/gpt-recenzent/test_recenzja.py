"""Testy recenzenta GPT. Uruchamiane w workflow przed recenzją: python3 -m unittest"""
import io
import os
import sys
import unittest
import urllib.error
from contextlib import redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recenzja  # noqa: E402


class MaskKeyTest(unittest.TestCase):
    def test_dokladna_wartosc_bez_prefiksu(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "tajny-123"}):
            self.assertEqual(recenzja.mask_key("a tajny-123 b tajny-123"), "a sk-… b sk-…")

    def test_format_sk(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            self.assertEqual(recenzja.mask_key("klucz sk-proj-Ab_9-x**z1 tu"), "klucz sk-… tu")

    def test_brak_zmiennej_i_tekst_bez_sekretow(self):
        env = {k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(recenzja.mask_key("zwykły tekst"), "zwykły tekst")


class AskGptTest(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {"OPENAI_API_KEY": "k", "OPENAI_MODEL": "gpt-test"})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_pusta_tresc_konczy_sie_kontrolowanie(self):
        with mock.patch.object(recenzja, "_request", return_value={"choices": [{"message": {"content": None}}]}):
            with self.assertRaises(SystemExit):
                recenzja.ask_gpt("x")

    def test_blad_sieci(self):
        with mock.patch.object(recenzja, "_request", side_effect=urllib.error.URLError("brak sieci")):
            with self.assertRaises(SystemExit):
                recenzja.ask_gpt("x")

    def test_poprawna_odpowiedz(self):
        with mock.patch.object(recenzja, "_request", return_value={"choices": [{"message": {"content": " ok "}}]}):
            self.assertEqual(recenzja.ask_gpt("x"), ("ok", "gpt-test"))


class PostToGithubTest(unittest.TestCase):
    def test_blad_sieci_nie_wywraca(self):
        env = {"GITHUB_REPOSITORY": "a/b", "GITHUB_TOKEN": "t", "HEAD_SHA": "abc", "PR_NUMBER": ""}
        with mock.patch.dict(os.environ, env), \
                mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("x")), \
                redirect_stdout(io.StringIO()) as out:
            recenzja.post_to_github("treść")
        self.assertIn("Nie udało się", out.getvalue())


if __name__ == "__main__":
    unittest.main()
