#!/usr/bin/env python3
"""
AI极客之家 — 网站管理工具
基于 wxPython 的可视化管理界面，覆盖 README 中的全部管理功能。
"""

import os
import re
import sys
import json
import subprocess
import shutil
from pathlib import Path

import wx
import wx.lib.agw.aui as aui
import wx.lib.scrolledpanel as scrolled

# ─────────────────────── 项目路径 ───────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent
POSTS_DIR = PROJECT_ROOT / "src" / "content" / "posts"
SITE_TS = PROJECT_ROOT / "src" / "site.ts"
FRIENDS_ASTRO = PROJECT_ROOT / "src" / "pages" / "friends.astro"
GLOBAL_CSS = PROJECT_ROOT / "src" / "styles" / "global.css"
ENCRYPTED_DIR = PROJECT_ROOT / "public" / "encrypted"
ARTICLES_JSON = PROJECT_ROOT / "src" / "data" / "articles.json"
GITIGNORE = PROJECT_ROOT / ".gitignore"

# ─────────────────────── 颜色主题 ───────────────────────
COLOR_BG       = wx.Colour(246, 248, 250)
COLOR_PAPER    = wx.Colour(255, 255, 255)
COLOR_ACCENT   = wx.Colour(9, 105, 218)
COLOR_ACCENT_D = wx.Colour(8, 96, 202)
COLOR_TEXT     = wx.Colour(31, 35, 40)
COLOR_MUTED    = wx.Colour(101, 109, 118)
COLOR_BORDER   = wx.Colour(208, 215, 222)
COLOR_SUCCESS  = wx.Colour(31, 136, 61)
COLOR_WARNING  = wx.Colour(154, 103, 0)
COLOR_SIDEBAR  = wx.Colour(255, 255, 255)
COLOR_TOPBAR   = wx.Colour(197, 217, 240)
COLOR_DANGER   = wx.Colour(207, 34, 46)


# ═══════════════════════════════════════════════════════════
#  工具函数
# ═══════════════════════════════════════════════════════════

def parse_frontmatter(text):
    """解析 Markdown frontmatter，返回 (meta_dict, body)"""
    m = re.match(r'^---\r?\n(.*?)\r?\n---\r?\n([\s\S]*)$', text, re.DOTALL)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).split('\n'):
        if ':' not in line:
            continue
        key, val = line.split(':', 1)
        key, val = key.strip(), val.strip()
        if val.startswith('[') and val.endswith(']'):
            val = [s.strip().strip("'\"") for s in val[1:-1].split(',')]
        elif val == 'true':
            val = True
        elif val == 'false':
            val = False
        else:
            val = val.strip("'\"")
        meta[key] = val
    return meta, m.group(2)


def build_frontmatter(meta, include_password=False):
    """将 meta dict 转回 frontmatter 字符串。

    include_password=True 时会把 meta 中的明文 password 写入 frontmatter
    （供创建/编辑受保护文章时保存密码）；默认 False 时跳过，避免密码被带回 UI 列表。
    """
    lines = ['---']
    for k, v in meta.items():
        if k == 'password' and not include_password:
            continue  # 不写入 frontmatter，避免密码出现在界面
        if isinstance(v, list):
            lines.append(f'{k}: [{", ".join(v)}]')
        elif isinstance(v, bool):
            lines.append(f'{k}: {"true" if v else "false"}')
        else:
            lines.append(f'{k}: {v}')
    lines.append('---')
    return '\n'.join(lines)


def run_cmd(args, cwd=None):
    """执行命令，返回 (returncode, stdout, stderr)"""
    try:
        r = subprocess.run(
            args, cwd=str(cwd or PROJECT_ROOT),
            capture_output=True, text=True, timeout=60,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
        )
        return r.returncode, r.stdout, r.stderr
    except Exception as e:
        return -1, '', str(e)


def open_with_default_app(path):
    """用系统默认应用打开文件（跨平台）"""
    path = str(path)
    if not os.path.exists(path):
        return False, f"文件不存在: {path}"
    try:
        if sys.platform == 'win32':
            os.startfile(path)
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', path])
        else:
            subprocess.Popen(['xdg-open', path])
        return True, ""
    except Exception as e:
        return False, str(e)


def get_article_list():
    """扫描 src/content/posts/ 下所有 md，返回 [{slug, meta, body}, ...]"""
    if not POSTS_DIR.exists():
        return []
    articles = []
    for f in sorted(POSTS_DIR.glob('*.md')):
        raw = f.read_text(encoding='utf-8')
        meta, body = parse_frontmatter(raw)
        articles.append({'slug': f.stem, 'meta': meta, 'body': body, 'path': f})
    return articles


# ═══════════════════════════════════════════════════════════
#  左侧导航面板
# ═══════════════════════════════════════════════════════════

NAV_ITEMS = [
    ("📝  文章管理", "articles"),
    ("📦  资源管理", "resources"),
    ("🔒  加密管理", "encrypt"),
    ("⚙️  站点设置", "settings"),
    ("🚀  部署管理", "deploy"),
    ("🔗  友链管理", "friends"),
    ("🎨  全局样式", "styles"),
]


class LeftPanel(wx.Panel):
    def __init__(self, parent, on_select):
        super().__init__(parent, size=(180, -1))
        self.SetBackgroundColour(COLOR_SIDEBAR)
        self.on_select = on_select
        self.buttons = {}

        sizer = wx.BoxSizer(wx.VERTICAL)

        title = wx.StaticText(self, label="AI极客之家\n管理工具")
        title.SetFont(_ui_font(14, wx.FONTWEIGHT_BOLD))
        title.SetForegroundColour(COLOR_ACCENT)
        sizer.Add(title, 0, wx.ALL | wx.ALIGN_CENTER_HORIZONTAL, 12)
        sizer.Add(wx.StaticLine(self), 0, wx.EXPAND | wx.LEFT | wx.RIGHT, 10)

        for label, key in NAV_ITEMS:
            btn = wx.Button(self, label=label, style=wx.BORDER_NONE)
            btn.SetFont(_ui_font(12))
            btn.SetMinSize((-1, 42))
            btn.SetBackgroundColour(COLOR_SIDEBAR)
            btn.SetForegroundColour(COLOR_TEXT)
            btn.Bind(wx.EVT_BUTTON, lambda evt, k=key: self._click(k))
            self.buttons[key] = btn
            sizer.Add(btn, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.TOP, 4)

        sizer.AddStretchSpacer()
        sizer.Add(wx.StaticLine(self), 0, wx.EXPAND | wx.LEFT | wx.RIGHT, 10)
        ver = wx.StaticText(self, label="v1.1 · wxPython")
        ver.SetFont(_ui_font(10))
        ver.SetForegroundColour(COLOR_MUTED)
        sizer.Add(ver, 0, wx.ALL | wx.ALIGN_CENTER_HORIZONTAL, 8)

        self.SetSizer(sizer)

    def _click(self, key):
        for k, b in self.buttons.items():
            if k == key:
                b.SetBackgroundColour(COLOR_ACCENT)
                b.SetForegroundColour(wx.WHITE)
            else:
                b.SetBackgroundColour(COLOR_SIDEBAR)
                b.SetForegroundColour(COLOR_TEXT)
        self.Layout()
        self.on_select(key)


# ═══════════════════════════════════════════════════════════
#  通用组件
# ═══════════════════════════════════════════════════════════

class ScrollPanel(scrolled.ScrolledPanel):
    """带滚动条的通用面板"""
    def __init__(self, parent):
        super().__init__(parent)
        self.SetBackgroundColour(COLOR_BG)
        self.SetupScrolling(scroll_x=False)

    def _rebuild(self):
        """延迟到当前事件处理完后再重建面板。
        避免在按钮点击事件回调中直接销毁正在处理事件的控件导致卡死。
        重建后刷新布局与滚动范围，否则 ScrolledPanel 会渲染错乱（只剩顶部文字）。"""
        def do_build():
            try:
                self._build()
            except Exception as exc:
                import traceback
                traceback.print_exc()
                wx.MessageBox(f"刷新面板失败：{exc}", "错误", wx.OK | wx.ICON_ERROR)
            finally:
                try:
                    self.Layout()
                    self.SetupScrolling(scroll_x=False)
                except Exception:
                    pass
        wx.CallAfter(do_build)


# 使用系统清晰 UI 字体（微软雅黑优先，回退默认）
def _ui_font(point, weight=wx.FONTWEIGHT_NORMAL, mono=False):
    family = wx.FONTFAMILY_MODERN if mono else wx.FONTFAMILY_DEFAULT
    return wx.Font(point, family, wx.FONTSTYLE_NORMAL, weight)


def make_text(parent, label, size=(13, -1), bold=False):
    t = wx.StaticText(parent, label=label)
    t.SetFont(_ui_font(size[0], wx.FONTWEIGHT_BOLD if bold else wx.FONTWEIGHT_NORMAL))
    t.SetForegroundColour(COLOR_TEXT)
    return t


def make_input(parent, value='', width=280):
    tc = wx.TextCtrl(parent, value=str(value), size=(width, -1))
    tc.SetFont(_ui_font(11))
    return tc


def make_button(parent, label, bg_color=COLOR_ACCENT, fg_color=wx.WHITE):
    btn = wx.Button(parent, label=label, style=wx.BORDER_NONE)
    btn.SetFont(_ui_font(11, wx.FONTWEIGHT_BOLD))
    btn.SetBackgroundColour(bg_color)
    btn.SetForegroundColour(fg_color)
    btn.SetMinSize((-1, 38))
    return btn


def make_info(parent, text, color=COLOR_MUTED):
    t = wx.StaticText(parent, label=text)
    t.SetFont(_ui_font(11))
    t.SetForegroundColour(color)
    t.Wrap(560)
    return t


# ═══════════════════════════════════════════════════════════
#  文章管理面板
# ═══════════════════════════════════════════════════════════

class ArticlesPanel(ScrollPanel):
    def __init__(self, parent):
        super().__init__(parent)
        self.sizer = wx.BoxSizer(wx.VERTICAL)
        self.SetSizer(self.sizer)
        self._build()
        self.Layout()
        self.SetupScrolling(scroll_x=False)

    def _build(self):
        self.sizer.Clear(True)
        self.sizer.Add(make_text(self, "📝 文章管理", (14, True)), 0, wx.ALL, 12)
        self.sizer.Add(make_info(self, "管理 src/content/posts/ 下的全部文章。"), 0, wx.LEFT | wx.BOTTOM, 12)

        btn_row = wx.BoxSizer(wx.HORIZONTAL)
        create_btn = make_button(self, "+ 新建文章")
        create_btn.Bind(wx.EVT_BUTTON, self._on_create)
        refresh_btn = make_button(self, "🔄 刷新列表", COLOR_MUTED)
        refresh_btn.Bind(wx.EVT_BUTTON, lambda e: self._rebuild())
        btn_row.Add(create_btn, 0, wx.RIGHT, 8)
        btn_row.Add(refresh_btn, 0)
        self.sizer.Add(btn_row, 0, wx.LEFT | wx.BOTTOM | wx.RIGHT, 12)

        articles = get_article_list()
        if not articles:
            self.sizer.Add(make_info(self, "暂无文章。"), 0, wx.ALL, 12)
            return

        for art in articles:
            self.sizer.Add(self._make_card(art), 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.TOP, 12)

    def _make_card(self, art):
        meta = art['meta']
        container = wx.Panel(self)
        container.SetBackgroundColour(COLOR_PAPER)
        container.SetMinSize((-1, 112))

        sizer = wx.BoxSizer(wx.HORIZONTAL)

        left = wx.BoxSizer(wx.VERTICAL)
        title = meta.get('title', art['slug'])
        typ = meta.get('type', 'article')
        access = meta.get('access', 'public')
        origin = meta.get('origin', 'original')
        date = meta.get('date', '')
        cat = meta.get('category', '')
        tags = meta.get('tags', [])
        tags_str = ' · '.join(tags) if isinstance(tags, list) else str(tags)

        label_text = f"{title}"
        badges = []
        if origin == 'repost':
            badges.append('搬运')
        if access == 'protected':
            badges.append('🔒 受保护')
        if typ == 'resource':
            badges.append('📦 资源')
        if meta.get('hot'):
            badges.append('🔥 热门')
        if badges:
            label_text += f"  [{' | '.join(badges)}]"

        title_st = wx.StaticText(container, label=label_text)
        title_st.SetFont(_ui_font(12, wx.FONTWEIGHT_BOLD))
        left.Add(title_st, 0, wx.LEFT | wx.TOP, 8)

        detail = f"{art['slug']}.md  ·  {date}  ·  {cat}"
        if tags_str:
            detail += f"  ·  {tags_str}"
        detail_st = wx.StaticText(container, label=detail)
        detail_st.SetFont(_ui_font(10))
        detail_st.SetForegroundColour(COLOR_MUTED)
        left.Add(detail_st, 0, wx.LEFT | wx.BOTTOM, 8)

        sizer.Add(left, 1, wx.EXPAND)

        btn_sizer = wx.BoxSizer(wx.VERTICAL)
        btn_sizer.Add((0, 0), 1)

        open_btn = make_button(container, "打开", COLOR_MUTED)
        open_btn.SetMinSize((60, 28))
        open_btn.Bind(wx.EVT_BUTTON, lambda e, s=art['slug']: self._on_open(s))
        btn_sizer.Add(open_btn, 0, wx.BOTTOM | wx.RIGHT, 4)

        edit_btn = make_button(container, "编辑", COLOR_ACCENT)
        edit_btn.SetMinSize((60, 28))
        edit_btn.Bind(wx.EVT_BUTTON, lambda e, s=art['slug']: self._on_edit(s))
        btn_sizer.Add(edit_btn, 0, wx.BOTTOM | wx.RIGHT, 4)

        del_btn = make_button(container, "删除", COLOR_DANGER)
        del_btn.SetMinSize((60, 28))
        del_btn.Bind(wx.EVT_BUTTON, lambda e, s=art['slug']: self._on_delete(s))
        btn_sizer.Add(del_btn, 0, wx.RIGHT, 4)

        sizer.Add(btn_sizer, 0, wx.ALL, 6)
        container.SetSizer(sizer)
        return container

    def _on_open(self, slug):
        f = POSTS_DIR / f"{slug}.md"
        if not f.exists():
            wx.MessageBox(f"文件不存在: {f}", "错误", wx.OK | wx.ICON_ERROR)
            return
        ok, err = open_with_default_app(f)
        if not ok:
            wx.MessageBox(f"打开失败: {err}", "错误", wx.OK | wx.ICON_ERROR)

    def _on_create(self, e):
        dlg = ArticleCreateDialog(self)
        if dlg.ShowModal() == wx.ID_OK:
            self._rebuild()
        dlg.Destroy()

    def _on_edit(self, slug):
        f = POSTS_DIR / f"{slug}.md"
        if not f.exists():
            wx.MessageBox(f"文件不存在: {f}", "错误", wx.OK | wx.ICON_ERROR)
            return
        dlg = ArticleEditDialog(self, f)
        if dlg.ShowModal() == wx.ID_OK:
            self._rebuild()
        dlg.Destroy()

    def _on_delete(self, slug):
        f = POSTS_DIR / f"{slug}.md"
        if not f.exists():
            wx.MessageBox(f"文件不存在: {f}", "错误", wx.OK | wx.ICON_ERROR)
            return
        r = wx.MessageBox(f"确定要删除文章 {slug}.md 吗？\n\n此操作不可恢复。", "确认删除",
                          wx.YES_NO | wx.ICON_WARNING)
        if r == wx.YES:
            f.unlink()
            enc_f = ENCRYPTED_DIR / f"{slug}.json"
            if enc_f.exists():
                enc_f.unlink()
            self._rebuild()
            wx.MessageBox(f"已删除 {slug}.md", "完成", wx.OK | wx.ICON_INFORMATION)


# ═══════════════════════════════════════════════════════════
#  文章创建对话框
# ═══════════════════════════════════════════════════════════

class ArticleCreateDialog(wx.Dialog):
    def __init__(self, parent):
        super().__init__(parent, title="新建文章", size=(560, 680),
                         style=wx.DEFAULT_DIALOG_STYLE | wx.RESIZE_BORDER)
        outer = wx.BoxSizer(wx.VERTICAL)

        # 滚动区：放所有表单字段
        self.scroll = wx.ScrolledWindow(self)
        self.scroll.SetBackgroundColour(COLOR_PAPER)
        self.scroll.SetScrollRate(0, 15)
        panel = self.scroll
        sizer = wx.BoxSizer(wx.VERTICAL)

        fields = [
            ("文件名 (slug)", "", "英文，如 my-post"),
            ("标题", "", "文章标题"),
            ("日期", "2026-01-01", "格式: YYYY-MM-DD"),
            ("分类", "未分类", "如：教程、入门"),
            ("标签 (逗号分隔)", "", "如：人工智能, 入门"),
            ("简介", "", "一句话描述"),
        ]
        self.inputs = {}
        for label, default, tip in fields:
            sizer.Add(make_text(panel, label, (10, True)), 0, wx.LEFT | wx.TOP, 12)
            inp = make_input(panel, default)
            sizer.Add(inp, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)
            sizer.Add(make_info(panel, tip), 0, wx.LEFT | wx.BOTTOM, 12)
            self.inputs[label] = inp

        sizer.Add(make_text(panel, "类型", (10, True)), 0, wx.LEFT | wx.TOP, 12)
        self.type_rb = wx.RadioBox(panel, label="", choices=["article", "resource", "page"],
                                   majorDimension=3, style=wx.RA_SPECIFY_COLS)
        sizer.Add(self.type_rb, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        sizer.Add(make_text(panel, "来源", (10, True)), 0, wx.LEFT | wx.TOP, 12)
        self.origin_rb = wx.RadioBox(panel, label="", choices=["original", "repost"],
                                     majorDimension=2, style=wx.RA_SPECIFY_COLS)
        sizer.Add(self.origin_rb, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        sizer.Add(make_text(panel, "访问权限", (10, True)), 0, wx.LEFT | wx.TOP, 12)
        self.access_rb = wx.RadioBox(panel, label="", choices=["public", "protected"],
                                     majorDimension=2, style=wx.RA_SPECIFY_COLS)
        sizer.Add(self.access_rb, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        sizer.Add(make_text(panel, "密码 (仅受保护文章)", (10, True)), 0, wx.LEFT | wx.TOP, 12)
        self.pwd_input = make_input(panel, '')
        sizer.Add(self.pwd_input, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        self.hot_cb = wx.CheckBox(panel, label="热门资源 (hot: true)")
        self.hot_cb.SetFont(_ui_font(11))
        sizer.Add(self.hot_cb, 0, wx.LEFT | wx.BOTTOM, 12)

        sizer.Add(make_text(panel, "正文 (Markdown)", (10, True)), 0, wx.LEFT | wx.TOP, 12)
        self.body_tc = wx.TextCtrl(panel, style=wx.TE_MULTILINE, size=(-1, 160))
        self.body_tc.SetFont(_ui_font(11, mono=True))
        sizer.Add(self.body_tc, 1, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        self.scroll.SetSizer(sizer)
        outer.Add(self.scroll, 1, wx.EXPAND)

        # 底部固定按钮条（始终可见）
        btn_bar = wx.Panel(self)
        btn_bar.SetBackgroundColour(COLOR_BG)
        btn_row = wx.BoxSizer(wx.HORIZONTAL)
        save_btn = make_button(btn_bar, "创建并保存")
        save_btn.Bind(wx.EVT_BUTTON, self._on_save)
        cancel_btn = make_button(btn_bar, "取消", COLOR_MUTED)
        cancel_btn.Bind(wx.EVT_BUTTON, lambda e: self.EndModal(wx.ID_CANCEL))
        btn_row.Add(save_btn, 0, wx.RIGHT, 8)
        btn_row.Add(cancel_btn, 0)
        top_sizer = wx.BoxSizer(wx.VERTICAL)
        top_sizer.Add(btn_row, 0, wx.ALL | wx.ALIGN_RIGHT, 12)
        btn_bar.SetSizer(top_sizer)
        outer.Add(btn_bar, 0, wx.EXPAND)

        self.SetSizer(outer)
        self.scroll.FitInside()

    def _on_save(self, e):
        slug = self.inputs["文件名 (slug)"].GetValue().strip()
        if not slug or not re.match(r'^[a-zA-Z0-9_-]+$', slug):
            wx.MessageBox("文件名不能为空，且只能包含字母、数字、下划线和连字符。", "错误", wx.OK | wx.ICON_ERROR)
            return

        f = POSTS_DIR / f"{slug}.md"
        if f.exists():
            wx.MessageBox(f"{slug}.md 已存在！", "错误", wx.OK | wx.ICON_ERROR)
            return

        tags_raw = self.inputs["标签 (逗号分隔)"].GetValue().strip()
        tags = [t.strip() for t in tags_raw.split(',') if t.strip()] if tags_raw else []

        meta = {
            'title': self.inputs["标题"].GetValue().strip() or slug,
            'date': self.inputs["日期"].GetValue().strip(),
            'category': self.inputs["分类"].GetValue().strip(),
            'tags': tags,
            'description': self.inputs["简介"].GetValue().strip(),
            'type': self.type_rb.GetStringSelection(),
            'origin': self.origin_rb.GetStringSelection(),
            'access': self.access_rb.GetStringSelection(),
            'hot': self.hot_cb.GetValue(),
        }

        if meta['access'] == 'protected':
            pwd = self.pwd_input.GetValue().strip()
            if not pwd:
                wx.MessageBox("受保护文章必须设置密码！", "错误", wx.OK | wx.ICON_ERROR)
                return
            meta['password'] = pwd

        content = build_frontmatter(meta, include_password=True) + '\n' + self.body_tc.GetValue() + '\n'

        POSTS_DIR.mkdir(parents=True, exist_ok=True)
        f.write_text(content, encoding='utf-8')
        hint = "\n\n该文章受保护，请到「🔒 加密管理」运行 bun run encrypt 后提交推送。"
        wx.MessageBox(f"文章已创建: {slug}.md{hint if meta['access'] == 'protected' else ''}", "完成", wx.OK | wx.ICON_INFORMATION)
        self.EndModal(wx.ID_OK)


# ═══════════════════════════════════════════════════════════
#  文章编辑对话框
# ═══════════════════════════════════════════════════════════

class ArticleEditDialog(wx.Dialog):
    def __init__(self, parent, filepath):
        self.filepath = filepath
        super().__init__(parent, title=f"编辑: {filepath.name}", size=(620, 680),
                         style=wx.DEFAULT_DIALOG_STYLE | wx.RESIZE_BORDER)
        outer = wx.BoxSizer(wx.VERTICAL)

        # 滚动区：放所有表单字段
        self.scroll = wx.ScrolledWindow(self)
        self.scroll.SetBackgroundColour(COLOR_PAPER)
        self.scroll.SetScrollRate(0, 15)
        panel = self.scroll
        sizer = wx.BoxSizer(wx.VERTICAL)

        raw = filepath.read_text(encoding='utf-8')
        meta, body = parse_frontmatter(raw)

        fields = [
            ("标题", meta.get('title', '')),
            ("日期", meta.get('date', '')),
            ("分类", meta.get('category', '')),
            ("标签 (逗号分隔)", ', '.join(meta['tags']) if isinstance(meta.get('tags'), list) else str(meta.get('tags', ''))),
            ("简介", meta.get('description', '')),
        ]
        self.inputs = {}
        for label, default in fields:
            sizer.Add(make_text(panel, label, (10, True)), 0, wx.LEFT | wx.TOP, 12)
            inp = make_input(panel, default)
            sizer.Add(inp, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 8)
            self.inputs[label] = inp

        row = wx.BoxSizer(wx.HORIZONTAL)
        row.Add(make_text(panel, "类型: "), 0, wx.ALIGN_CENTER_VERTICAL)
        self.type_rb = wx.RadioBox(panel, label="", choices=["article", "resource", "page"],
                                   majorDimension=3, style=wx.RA_SPECIFY_COLS)
        sel = meta.get('type', 'article')
        self.type_rb.SetSelection(["article", "resource", "page"].index(sel) if sel in ["article", "resource", "page"] else 0)
        row.Add(self.type_rb, 0)
        sizer.Add(row, 0, wx.LEFT | wx.BOTTOM, 12)

        row2 = wx.BoxSizer(wx.HORIZONTAL)
        row2.Add(make_text(panel, "来源: "), 0, wx.ALIGN_CENTER_VERTICAL)
        self.origin_rb = wx.RadioBox(panel, label="", choices=["original", "repost"],
                                     majorDimension=2, style=wx.RA_SPECIFY_COLS)
        sel = meta.get('origin', 'original')
        self.origin_rb.SetSelection(0 if sel == 'original' else 1)
        row2.Add(self.origin_rb, 0)
        sizer.Add(row2, 0, wx.LEFT | wx.BOTTOM, 12)

        row3 = wx.BoxSizer(wx.HORIZONTAL)
        row3.Add(make_text(panel, "权限: "), 0, wx.ALIGN_CENTER_VERTICAL)
        self.access_rb = wx.RadioBox(panel, label="", choices=["public", "protected"],
                                     majorDimension=2, style=wx.RA_SPECIFY_COLS)
        sel = meta.get('access', 'public')
        self.access_rb.SetSelection(0 if sel == 'public' else 1)
        row3.Add(self.access_rb, 0)
        sizer.Add(row3, 0, wx.LEFT | wx.BOTTOM, 12)

        sizer.Add(make_text(panel, "密码 (仅受保护文章)", (10, True)), 0, wx.LEFT | wx.TOP, 12)
        self.pwd_input = make_input(panel, str(meta.get('password', '')))
        self.pwd_input.SetFont(_ui_font(11, mono=True))
        sizer.Add(self.pwd_input, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)
        self.pwd_input.Enable(meta.get('access', 'public') == 'protected')
        self.access_rb.Bind(wx.EVT_RADIOBOX, self._on_access_change)

        self.hot_cb = wx.CheckBox(panel, label="热门资源 (hot: true)")
        self.hot_cb.SetValue(meta.get('hot', False))
        self.hot_cb.SetFont(_ui_font(11))
        sizer.Add(self.hot_cb, 0, wx.LEFT | wx.BOTTOM, 12)

        sizer.Add(make_text(panel, "正文 (Markdown)", (10, True)), 0, wx.LEFT | wx.TOP, 12)
        self.body_tc = wx.TextCtrl(panel, value=body, style=wx.TE_MULTILINE, size=(-1, 150))
        self.body_tc.SetFont(_ui_font(11, mono=True))
        sizer.Add(self.body_tc, 1, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        self.scroll.SetSizer(sizer)
        outer.Add(self.scroll, 1, wx.EXPAND)

        # 底部固定按钮条（始终可见）
        btn_bar = wx.Panel(self)
        btn_bar.SetBackgroundColour(COLOR_BG)
        btn_row = wx.BoxSizer(wx.HORIZONTAL)
        save_btn = make_button(btn_bar, "💾 保存")
        save_btn.Bind(wx.EVT_BUTTON, self._on_save)
        cancel_btn = make_button(btn_bar, "取消", COLOR_MUTED)
        cancel_btn.Bind(wx.EVT_BUTTON, lambda e: self.EndModal(wx.ID_CANCEL))
        btn_row.Add(save_btn, 0, wx.RIGHT, 8)
        btn_row.Add(cancel_btn, 0)
        top_sizer = wx.BoxSizer(wx.VERTICAL)
        top_sizer.Add(btn_row, 0, wx.ALL | wx.ALIGN_RIGHT, 12)
        btn_bar.SetSizer(top_sizer)
        outer.Add(btn_bar, 0, wx.EXPAND)

        self.SetSizer(outer)
        self.scroll.FitInside()

    def _on_access_change(self, e):
        self.pwd_input.Enable(self.access_rb.GetStringSelection() == 'protected')
        e.Skip()

    def _on_save(self, e):
        tags_raw = self.inputs["标签 (逗号分隔)"].GetValue().strip()
        tags = [t.strip() for t in tags_raw.split(',') if t.strip()] if tags_raw else []

        meta = {
            'title': self.inputs["标题"].GetValue().strip(),
            'date': self.inputs["日期"].GetValue().strip(),
            'category': self.inputs["分类"].GetValue().strip(),
            'tags': tags,
            'description': self.inputs["简介"].GetValue().strip(),
            'type': self.type_rb.GetStringSelection(),
            'origin': self.origin_rb.GetStringSelection(),
            'access': self.access_rb.GetStringSelection(),
            'hot': self.hot_cb.GetValue(),
        }

        if meta['access'] == 'protected':
            pwd = self.pwd_input.GetValue().strip()
            if not pwd:
                wx.MessageBox("受保护文章必须设置密码！", "错误", wx.OK | wx.ICON_ERROR)
                return
            meta['password'] = pwd

        content = build_frontmatter(meta, include_password=True) + '\n' + self.body_tc.GetValue() + '\n'
        self.filepath.write_text(content, encoding='utf-8')
        hint = "\n\n若修改了密码或正文，请到「🔒 加密管理」运行 bun run encrypt 后提交推送。"
        wx.MessageBox(f"已保存: {self.filepath.name}{hint if meta['access'] == 'protected' else ''}", "完成", wx.OK | wx.ICON_INFORMATION)
        self.EndModal(wx.ID_OK)


# ═══════════════════════════════════════════════════════════
#  资源管理面板
# ═══════════════════════════════════════════════════════════

class ResourcesPanel(ScrollPanel):
    def __init__(self, parent):
        super().__init__(parent)
        self.sizer = wx.BoxSizer(wx.VERTICAL)
        self.SetSizer(self.sizer)
        self._build()
        self.Layout()
        self.SetupScrolling(scroll_x=False)

    def _build(self):
        self.sizer.Clear(True)
        self.sizer.Add(make_text(self, "📦 资源管理", (14, True)), 0, wx.ALL, 12)
        self.sizer.Add(make_info(self, "管理标记为 type=resource 的资源，热门资源由 hot: true 决定。"), 0, wx.LEFT | wx.BOTTOM, 12)

        btn_row = wx.BoxSizer(wx.HORIZONTAL)
        create_btn = make_button(self, "+ 新建资源")
        create_btn.Bind(wx.EVT_BUTTON, self._on_create)
        refresh_btn = make_button(self, "🔄 刷新列表", COLOR_MUTED)
        refresh_btn.Bind(wx.EVT_BUTTON, lambda e: self._rebuild())
        btn_row.Add(create_btn, 0, wx.RIGHT, 8)
        btn_row.Add(refresh_btn, 0)
        self.sizer.Add(btn_row, 0, wx.LEFT | wx.BOTTOM | wx.RIGHT, 12)

        articles = [a for a in get_article_list() if a['meta'].get('type') == 'resource']
        if not articles:
            self.sizer.Add(make_info(self, "暂无资源。"), 0, wx.ALL, 12)
            return

        for art in articles:
            meta = art['meta']
            card = wx.Panel(self)
            card.SetBackgroundColour(COLOR_PAPER)
            sizer = wx.BoxSizer(wx.HORIZONTAL)

            title = meta.get('title', art['slug'])
            hot = '🔥 热门' if meta.get('hot') else ''
            desc = meta.get('description', '')
            date = meta.get('date', '')

            left = wx.BoxSizer(wx.VERTICAL)
            t = wx.StaticText(card, label=f"{title}  {hot}")
            t.SetFont(_ui_font(12, wx.FONTWEIGHT_BOLD))
            left.Add(t, 0, wx.LEFT | wx.TOP, 8)
            if desc:
                d = wx.StaticText(card, label=f"{desc}  ·  {date}")
                d.SetFont(_ui_font(10))
                d.SetForegroundColour(COLOR_MUTED)
                left.Add(d, 0, wx.LEFT | wx.BOTTOM, 8)
            sizer.Add(left, 1, wx.EXPAND)

            btn_s = wx.BoxSizer(wx.VERTICAL)
            btn_s.Add((0, 0), 1)
            open_btn = make_button(card, "打开", COLOR_MUTED)
            open_btn.SetMinSize((60, 28))
            open_btn.Bind(wx.EVT_BUTTON, lambda e, s=art['slug']: self._on_open(s))
            btn_s.Add(open_btn, 0, wx.BOTTOM, 4)

            edit_btn = make_button(card, "编辑", COLOR_ACCENT)
            edit_btn.SetMinSize((60, 28))
            edit_btn.Bind(wx.EVT_BUTTON, lambda e, s=art['slug']: self._on_edit(s))
            btn_s.Add(edit_btn, 0, wx.BOTTOM, 4)

            hot_label = "取消热门" if meta.get('hot') else "设为热门"
            hot_color = COLOR_WARNING if meta.get('hot') else COLOR_SUCCESS
            hot_btn = make_button(card, hot_label, hot_color)
            hot_btn.SetMinSize((80, 28))
            hot_btn.Bind(wx.EVT_BUTTON, lambda e, s=art['slug'], h=not meta.get('hot'): self._toggle_hot(s, h))
            btn_s.Add(hot_btn, 0)

            del_btn = make_button(card, "删除", COLOR_DANGER)
            del_btn.SetMinSize((60, 28))
            del_btn.Bind(wx.EVT_BUTTON, lambda e, s=art['slug']: self._on_delete(s))
            btn_s.Add(del_btn, 0, wx.TOP | wx.LEFT | wx.RIGHT | wx.BOTTOM, 4)
            sizer.Add(btn_s, 0, wx.ALL, 6)

            card.SetSizer(sizer)
            self.sizer.Add(card, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.TOP, 12)

    def _on_create(self, e):
        dlg = ArticleCreateDialog(self)
        dlg.type_rb.SetSelection(1)
        if dlg.ShowModal() == wx.ID_OK:
            self._rebuild()
        dlg.Destroy()

    def _on_edit(self, slug):
        f = POSTS_DIR / f"{slug}.md"
        if not f.exists():
            wx.MessageBox(f"文件不存在: {f}", "错误", wx.OK | wx.ICON_ERROR)
            return
        dlg = ArticleEditDialog(self, f)
        if dlg.ShowModal() == wx.ID_OK:
            self._rebuild()
        dlg.Destroy()

    def _on_open(self, slug):
        f = POSTS_DIR / f"{slug}.md"
        if not f.exists():
            wx.MessageBox(f"文件不存在: {f}", "错误", wx.OK | wx.ICON_ERROR)
            return
        ok, err = open_with_default_app(f)
        if not ok:
            wx.MessageBox(f"打开失败: {err}", "错误", wx.OK | wx.ICON_ERROR)

    def _toggle_hot(self, slug, hot_val):
        f = POSTS_DIR / f"{slug}.md"
        if not f.exists():
            return
        raw = f.read_text(encoding='utf-8')
        meta, body = parse_frontmatter(raw)
        meta['hot'] = hot_val
        content = build_frontmatter(meta) + '\n' + body
        f.write_text(content, encoding='utf-8')
        state = "已设为热门" if hot_val else "已取消热门"
        wx.MessageBox(f"{slug}: {state}", "完成", wx.OK | wx.ICON_INFORMATION)
        self._rebuild()

    def _on_delete(self, slug):
        f = POSTS_DIR / f"{slug}.md"
        if not f.exists():
            wx.MessageBox(f"文件不存在: {f}", "错误", wx.OK | wx.ICON_ERROR)
            return
        r = wx.MessageBox(f"确定要删除资源 {slug}.md 吗？\n\n此操作不可恢复。", "确认删除",
                          wx.YES_NO | wx.ICON_WARNING)
        if r == wx.YES:
            f.unlink()
            enc_f = ENCRYPTED_DIR / f"{slug}.json"
            if enc_f.exists():
                enc_f.unlink()
            self._rebuild()
            wx.MessageBox(f"已删除 {slug}.md", "完成", wx.OK | wx.ICON_INFORMATION)


# ═══════════════════════════════════════════════════════════
#  加密管理面板
# ═══════════════════════════════════════════════════════════

class EncryptPanel(ScrollPanel):
    def __init__(self, parent):
        super().__init__(parent)
        self.sizer = wx.BoxSizer(wx.VERTICAL)
        self.SetSizer(self.sizer)
        self._build()
        self.Layout()
        self.SetupScrolling(scroll_x=False)

    def _build(self):
        self.sizer.Clear(True)
        self.sizer.Add(make_text(self, "🔒 加密管理", (14, True)), 0, wx.ALL, 12)
        self.sizer.Add(make_info(self, "运行加密脚本，生成 articles.json 和 public/encrypted/*.json。"), 0, wx.LEFT | wx.BOTTOM, 12)

        btn_row = wx.BoxSizer(wx.HORIZONTAL)
        run_btn = make_button(self, "🔐 运行 bun run encrypt", COLOR_WARNING)
        run_btn.Bind(wx.EVT_BUTTON, self._on_encrypt)
        btn_row.Add(run_btn, 0, wx.RIGHT, 8)

        build_btn = make_button(self, "🔨 运行 bun run build", COLOR_ACCENT)
        build_btn.Bind(wx.EVT_BUTTON, self._on_build)
        btn_row.Add(build_btn, 0, wx.RIGHT, 8)

        check_btn = make_button(self, "🔍 bun run check", COLOR_MUTED)
        check_btn.Bind(wx.EVT_BUTTON, self._on_check)
        btn_row.Add(check_btn, 0)
        self.sizer.Add(btn_row, 0, wx.LEFT | wx.BOTTOM | wx.RIGHT, 12)

        self.log_tc = wx.TextCtrl(self, style=wx.TE_MULTILINE | wx.TE_READONLY, size=(-1, 180))
        self.log_tc.SetFont(_ui_font(11, mono=True))
        self.log_tc.SetBackgroundColour(wx.Colour(13, 17, 23))
        self.log_tc.SetForegroundColour(wx.Colour(230, 237, 243))
        self.sizer.Add(self.log_tc, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        self.sizer.Add(make_text(self, "受保护文章列表", (11, True)), 0, wx.LEFT | wx.TOP, 12)

        articles = [a for a in get_article_list() if a['meta'].get('access') == 'protected']
        if not articles:
            self.sizer.Add(make_info(self, "暂无受保护文章。"), 0, wx.LEFT, 12)
        for art in articles:
            f = POSTS_DIR / f"{art['slug']}.md"
            enc = ENCRYPTED_DIR / f"{art['slug']}.json"
            status = "✅ 已加密" if enc.exists() else "⚠️ 未加密"
            line = f"  {art['slug']}.md  →  {status}"
            self.sizer.Add(make_info(self, line), 0, wx.LEFT | wx.TOP, 12)

        self.sizer.Add(make_text(self, "加密原理", (11, True)), 0, wx.LEFT | wx.TOP | wx.BOTTOM, 12)
        info_lines = [
            "• AES-256-GCM 算法 + PBKDF2 密钥派生 (100k 迭代)",
            "• 受保护文章正文加密存储在 public/encrypted/",
            "• CI 构建时不运行 encrypt，必须已提交 articles.json",
            "• 新增/删除/修改受保护文章后都要运行 bun run encrypt",
        ]
        for line in info_lines:
            self.sizer.Add(make_info(self, line), 0, wx.LEFT, 16)

    def _run_and_log(self, cmd):
        self.log_tc.Clear()
        self.log_tc.AppendText(f"> {' '.join(cmd)}\n\n")
        wx.BeginBusyCursor()
        code, out, err = run_cmd(cmd)
        wx.EndBusyCursor()
        if out:
            self.log_tc.AppendText(out)
        if err:
            self.log_tc.AppendText(f"\n[stderr]\n{err}")
        self.log_tc.AppendText(f"\n--- 退出码: {code} ---\n")
        return code

    def _on_encrypt(self, e):
        self._run_and_log(["bun", "run", "encrypt"])

    def _on_build(self, e):
        self._run_and_log(["bun", "run", "build"])

    def _on_check(self, e):
        self._run_and_log(["bun", "run", "check"])


# ═══════════════════════════════════════════════════════════
#  站点设置面板
# ═══════════════════════════════════════════════════════════

class SiteSettingsPanel(ScrollPanel):
    def __init__(self, parent):
        super().__init__(parent)
        self.sizer = wx.BoxSizer(wx.VERTICAL)
        self.SetSizer(self.sizer)
        self._build()
        self.Layout()
        self.SetupScrolling(scroll_x=False)

    def _load_site_ts(self):
        if SITE_TS.exists():
            return SITE_TS.read_text(encoding='utf-8')
        return ''

    def _parse_site(self, text):
        """从 site.ts 文本中提取配置项"""
        result = {}
        for key in ['title', 'name', 'bio', 'avatar']:
            m = re.search(rf"{key}:\s*['\"](.+?)['\"]", text)
            if m:
                result[key] = m.group(1)
        # 提取 nav
        nav_matches = re.findall(r"\{\s*href:\s*['\"](.+?)['\"]\s*,\s*label:\s*['\"](.+?)['\"]\s*,\s*icon:\s*['\"](.+?)['\"]\s*\}", text)
        result['nav'] = [{'href': h, 'label': l, 'icon': i} for h, l, i in nav_matches]
        # 提取 contact
        contact_matches = re.findall(r"\{\s*icon:\s*['\"](.+?)['\"]\s*,\s*label:\s*['\"](.+?)['\"]\s*,\s*href:\s*['\"](.+?)['\"]\s*\}", text)
        result['contact'] = [{'icon': ic, 'label': l, 'href': h} for ic, l, h in contact_matches]
        return result

    def _build(self):
        self.sizer.Clear(True)
        self.sizer.Add(make_text(self, "⚙️ 站点设置", (14, True)), 0, wx.ALL, 12)
        self.sizer.Add(make_info(self, "编辑 src/site.ts 中的站点配置信息。"), 0, wx.LEFT | wx.BOTTOM, 12)

        text = self._load_site_ts()
        site = self._parse_site(text)

        self.inputs = {}
        for key, label in [('title', '站点标题'), ('name', '站长名称'), ('bio', '副标题'), ('avatar', '头像路径')]:
            sizer_row = wx.BoxSizer(wx.HORIZONTAL)
            sizer_row.Add(make_text(self, f"{label}: ", (10, True)), 0, wx.ALIGN_CENTER_VERTICAL | wx.RIGHT, 8)
            inp = make_input(self, site.get(key, ''), 300)
            sizer_row.Add(inp, 0)
            self.sizer.Add(sizer_row, 0, wx.LEFT | wx.BOTTOM, 12)
            self.inputs[key] = inp

        # 导航菜单
        self.sizer.Add(make_text(self, "导航菜单", (11, True)), 0, wx.LEFT | wx.TOP, 12)
        self.nav_panels = []
        for item in site.get('nav', []):
            self._add_nav_row(item)
        add_nav_btn = make_button(self, "+ 添加导航项", COLOR_SUCCESS)
        add_nav_btn.Bind(wx.EVT_BUTTON, self._add_nav_row)
        self.sizer.Add(add_nav_btn, 0, wx.LEFT | wx.BOTTOM, 12)

        # 联系方式
        self.sizer.Add(make_text(self, "联系方式", (11, True)), 0, wx.LEFT | wx.TOP, 12)
        self.contact_panels = []
        for item in site.get('contact', []):
            self._add_contact_row(item)
        add_contact_btn = make_button(self, "+ 添加联系方式", COLOR_SUCCESS)
        add_contact_btn.Bind(wx.EVT_BUTTON, self._add_contact_row)
        self.sizer.Add(add_contact_btn, 0, wx.LEFT | wx.BOTTOM, 12)

        save_btn = make_button(self, "💾 保存到 site.ts")
        save_btn.Bind(wx.EVT_BUTTON, self._on_save)
        self.sizer.Add(save_btn, 0, wx.ALL | wx.ALIGN_RIGHT, 12)

    def _add_nav_row(self, item=None):
        if isinstance(item, wx.CommandEvent):
            item = None
        item = item or {'href': '/', 'label': '', 'icon': 'fa-house'}
        panel = wx.Panel(self)
        sizer = wx.BoxSizer(wx.HORIZONTAL)

        fields = {}
        for key, label, default in [('href', '路径', item['href']), ('label', '名称', item['label']), ('icon', '图标', item['icon'])]:
            sizer.Add(make_text(panel, f"{label}:", (9, False)), 0, wx.ALIGN_CENTER_VERTICAL | wx.RIGHT, 4)
            inp = make_input(panel, default, 120)
            sizer.Add(inp, 0, wx.RIGHT, 8)
            fields[key] = inp

        del_btn = make_button(panel, "×", COLOR_DANGER)
        del_btn.SetMinSize((28, 28))
        del_btn.Bind(wx.EVT_BUTTON, lambda e, p=panel: self._del_nav(p))
        sizer.Add(del_btn, 0, wx.ALIGN_CENTER_VERTICAL)

        panel.SetSizer(sizer)
        self.nav_panels.append((panel, fields))
        self.sizer.Add(panel, 0, wx.LEFT | wx.BOTTOM, 12)

    def _del_nav(self, panel):
        self.nav_panels = [(p, f) for p, f in self.nav_panels if p != panel]
        panel.Destroy()
        self.Layout()

    def _add_contact_row(self, item=None):
        if isinstance(item, wx.CommandEvent):
            item = None
        item = item or {'icon': 'fa-envelope', 'label': '', 'href': ''}
        panel = wx.Panel(self)
        sizer = wx.BoxSizer(wx.HORIZONTAL)

        fields = {}
        for key, label, default, w in [('icon', '图标', item['icon'], 120), ('label', '名称', item['label'], 140), ('href', '链接', item['href'], 200)]:
            sizer.Add(make_text(panel, f"{label}:", (9, False)), 0, wx.ALIGN_CENTER_VERTICAL | wx.RIGHT, 4)
            inp = make_input(panel, default, w)
            sizer.Add(inp, 0, wx.RIGHT, 8)
            fields[key] = inp

        del_btn = make_button(panel, "×", COLOR_DANGER)
        del_btn.SetMinSize((28, 28))
        del_btn.Bind(wx.EVT_BUTTON, lambda e, p=panel: self._del_contact(p))
        sizer.Add(del_btn, 0, wx.ALIGN_CENTER_VERTICAL)

        panel.SetSizer(sizer)
        self.contact_panels.append((panel, fields))
        self.sizer.Add(panel, 0, wx.LEFT | wx.BOTTOM, 12)

    def _del_contact(self, panel):
        self.contact_panels = [(p, f) for p, f in self.contact_panels if p != panel]
        panel.Destroy()
        self.Layout()

    def _on_save(self, e):
        title = self.inputs['title'].GetValue().strip()
        name = self.inputs['name'].GetValue().strip()
        bio = self.inputs['bio'].GetValue().strip()
        avatar = self.inputs['avatar'].GetValue().strip()

        lines = ["export const site = {"]
        lines.append(f"  title: '{title}',")
        lines.append(f"  name: '{name}',")
        lines.append(f"  bio: '{bio}',")
        lines.append(f"  avatar: '{avatar}',")

        lines.append("  nav: [")
        for _, fields in self.nav_panels:
            href = fields['href'].GetValue().strip()
            label = fields['label'].GetValue().strip()
            icon = fields['icon'].GetValue().strip()
            lines.append(f"    {{ href: '{href}', label: '{label}', icon: '{icon}' }},")
        lines.append("  ],")

        lines.append("  contact: [")
        for _, fields in self.contact_panels:
            icon = fields['icon'].GetValue().strip()
            label = fields['label'].GetValue().strip()
            href = fields['href'].GetValue().strip()
            lines.append(f"    {{ icon: '{icon}', label: '{label}', href: '{href}' }},")
        lines.append("  ],")
        lines.append("};")

        SITE_TS.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        wx.MessageBox("site.ts 已保存！", "完成", wx.OK | wx.ICON_INFORMATION)
        self._rebuild()


# ═══════════════════════════════════════════════════════════
#  部署管理面板
# ═══════════════════════════════════════════════════════════

class DeployPanel(ScrollPanel):
    def __init__(self, parent):
        super().__init__(parent)
        self.sizer = wx.BoxSizer(wx.VERTICAL)
        self.SetSizer(self.sizer)
        self._build()
        self.Layout()
        self.SetupScrolling(scroll_x=False)

    def _build(self):
        self.sizer.Clear(True)
        self.sizer.Add(make_text(self, "🚀 部署管理", (14, True)), 0, wx.ALL, 12)
        self.sizer.Add(make_info(self, "Git 操作：查看状态、提交、推送至 atom1st.github.io。"), 0, wx.LEFT | wx.BOTTOM, 12)

        self._add_tutorial()

        btn_row = wx.BoxSizer(wx.HORIZONTAL)
        status_btn = make_button(self, "📊 git status")
        status_btn.Bind(wx.EVT_BUTTON, self._on_status)
        diff_btn = make_button(self, "📋 git diff")
        diff_btn.Bind(wx.EVT_BUTTON, self._on_diff)
        log_btn = make_button(self, "📜 git log")
        log_btn.Bind(wx.EVT_BUTTON, self._on_log)
        pull_btn = make_button(self, "⬇️ git pull", COLOR_MUTED)
        pull_btn.Bind(wx.EVT_BUTTON, self._on_pull)
        btn_row.Add(status_btn, 0, wx.RIGHT, 6)
        btn_row.Add(diff_btn, 0, wx.RIGHT, 6)
        btn_row.Add(log_btn, 0, wx.RIGHT, 6)
        btn_row.Add(pull_btn, 0)
        self.sizer.Add(btn_row, 0, wx.LEFT | wx.BOTTOM | wx.RIGHT, 12)

        self.sizer.Add(make_text(self, "提交信息", (10, True)), 0, wx.LEFT | wx.TOP, 12)
        self.commit_input = make_input(self, '', 450)
        self.sizer.Add(self.commit_input, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        action_row = wx.BoxSizer(wx.HORIZONTAL)
        add_all_btn = make_button(self, "git add -A")
        add_all_btn.Bind(wx.EVT_BUTTON, self._on_add)
        commit_btn = make_button(self, "git commit", COLOR_SUCCESS)
        commit_btn.Bind(wx.EVT_BUTTON, self._on_commit)
        push_btn = make_button(self, "🚀 git push", COLOR_ACCENT)
        push_btn.Bind(wx.EVT_BUTTON, self._on_push)
        action_row.Add(add_all_btn, 0, wx.RIGHT, 6)
        action_row.Add(commit_btn, 0, wx.RIGHT, 6)
        action_row.Add(push_btn, 0)
        self.sizer.Add(action_row, 0, wx.LEFT | wx.BOTTOM | wx.RIGHT, 12)

        full_btn_row = wx.BoxSizer(wx.HORIZONTAL)
        full_btn = make_button(self, "⚡ 一键提交推送 (add → commit → push)", COLOR_ACCENT_D)
        full_btn.Bind(wx.EVT_BUTTON, self._on_full_deploy)
        full_btn_row.Add(full_btn, 0)
        self.sizer.Add(full_btn_row, 0, wx.LEFT | wx.BOTTOM | wx.RIGHT, 12)

        self.log_tc = wx.TextCtrl(self, style=wx.TE_MULTILINE | wx.TE_READONLY, size=(-1, 240))
        self.log_tc.SetFont(_ui_font(11, mono=True))
        self.log_tc.SetBackgroundColour(wx.Colour(13, 17, 23))
        self.log_tc.SetForegroundColour(wx.Colour(230, 237, 243))
        self.sizer.Add(self.log_tc, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

    def _log(self, text):
        self.log_tc.AppendText(text + "\n")

    def _add_tutorial(self):
        """在部署面板顶部加入中文部署教程（参考 README）"""
        box = wx.StaticBox(self, label="📘 部署教程（新手必读）")
        box.SetFont(_ui_font(12, wx.FONTWEIGHT_BOLD))
        sb = wx.StaticBoxSizer(box, wx.VERTICAL)

        lines = [
            ("使用流程", [
                "1. 先在下方填写「提交信息」，例如：更新文章 xxx",
                "2. 点击「⚡ 一键提交推送」，工具会自动执行 git add → commit → push",
                "3. GitHub Actions 会在 1-2 分钟内自动构建并部署到 https://atom1st.github.io",
            ]),
            ("日常改文章（公开）", [
                "在「文章管理」里新建/编辑文章 → 保存后，直接到本页一键提交推送即可。",
            ]),
            ("添加受保护文章（加密）", [
                "1. 在「文章管理」新建文章，访问权限选 protected 并填写密码",
                "2. 到「🔒 加密管理」点击「运行 bun run encrypt」生成密文",
                "3. 回到本页，点击「⚡ 一键提交推送」发布（articles.json 和 encrypted/*.json 会一起提交）",
                "⚠️ 忘记运行 encrypt 就推送，加密文章将不会出现在线上！",
            ]),
            ("GitHub Actions 部署原理", [
                "每次 push 到 main 会自动执行：bun install → bun run build → 部署 dist/",
                "⚠️ 请勿在仓库 Settings → Pages 把来源切回「从分支部署」，否则 GitHub 会用 Jekyll 解析 .astro 报错。",
            ]),
            ("首次部署需在 GitHub 设置", [
                "仓库 Settings → Pages → Build and deployment → Source 选择 GitHub Actions（一次性设置）。",
            ]),
        ]

        for title, items in lines:
            hl = wx.StaticText(box, label=title)
            hl.SetFont(_ui_font(11, wx.FONTWEIGHT_BOLD))
            hl.SetForegroundColour(COLOR_WARNING)
            sb.Add(hl, 0, wx.LEFT | wx.TOP, 8)
            for item in items:
                it = wx.StaticText(box, label="  " + item)
                it.SetFont(_ui_font(11))
                it.SetForegroundColour(COLOR_TEXT)
                it.Wrap(620)
                sb.Add(it, 0, wx.LEFT | wx.RIGHT | wx.TOP, 2)

        self.sizer.Add(sb, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

    def _run(self, args, label=''):
        self._log(f"\n{'='*50}")
        if label:
            self._log(f"  {label}")
        self._log(f"> {' '.join(args)}")
        code, out, err = run_cmd(args)
        if out:
            self._log(out.rstrip())
        if err:
            self._log(f"[stderr] {err.rstrip()}")
        self._log(f"--- 退出码: {code} ---")
        return code

    def _on_status(self, e):
        self.log_tc.Clear()
        self._run(["git", "status"], "查看仓库状态")

    def _on_diff(self, e):
        self.log_tc.Clear()
        self._run(["git", "diff"], "查看变更差异")

    def _on_log(self, e):
        self.log_tc.Clear()
        self._run(["git", "log", "--oneline", "-15"], "最近 15 条提交")

    def _on_pull(self, e):
        self._run(["git", "pull", "origin", "main"], "拉取远程最新代码")

    def _on_add(self, e):
        self._run(["git", "add", "-A"], "暂存全部文件")

    def _on_commit(self, e):
        msg = self.commit_input.GetValue().strip()
        if not msg:
            wx.MessageBox("请输入提交信息！", "错误", wx.OK | wx.ICON_ERROR)
            return
        self._run(["git", "commit", "-m", msg], f"提交: {msg}")

    def _on_push(self, e):
        self._run(["git", "push", "origin", "main"], "推送到远程仓库")

    def _on_full_deploy(self, e):
        msg = self.commit_input.GetValue().strip()
        if not msg:
            wx.MessageBox("请输入提交信息！", "错误", wx.OK | wx.ICON_ERROR)
            return
        self.log_tc.Clear()
        self._log("⚡ 一键部署开始")
        r = self._run(["git", "add", "-A"], "步骤 1/3: git add -A")
        if r != 0:
            return
        r = self._run(["git", "commit", "-m", msg], f"步骤 2/3: git commit -m \"{msg}\"")
        if r != 0:
            return
        self._run(["git", "push", "origin", "main"], "步骤 3/3: git push origin main")
        self._log("\n✅ 一键部署完成！GitHub Actions 将在 1-2 分钟内自动构建部署。")


# ═══════════════════════════════════════════════════════════
#  友链管理面板
# ═══════════════════════════════════════════════════════════

class FriendsPanel(ScrollPanel):
    def __init__(self, parent):
        super().__init__(parent)
        self.sizer = wx.BoxSizer(wx.VERTICAL)
        self.SetSizer(self.sizer)
        self._build()
        self.Layout()
        self.SetupScrolling(scroll_x=False)

    def _parse_friends(self, text):
        """从 friends.astro 中解析出所有友链卡片数据"""
        friends = []
        pattern = re.compile(
            r'<div class="friend-card">\s*'
            r'<img src="([^"]+)"[^>]*/>\s*'
            r'<div>\s*'
            r'<h3>(.*?)</h3>\s*'
            r'<p>(.*?)</p>\s*'
            r'<a href="([^"]+)"[^>]*>(.*?)</a>\s*'
            r'</div>\s*'
            r'</div>', re.DOTALL)
        for m in pattern.finditer(text):
            friends.append({
                'avatar': m.group(1).strip(),
                'name': m.group(2).strip(),
                'desc': m.group(3).strip(),
                'url': m.group(4).strip(),
                'url_text': m.group(5).strip(),
            })
        return friends

    def _build(self):
        self.sizer.Clear(True)
        self.sizer.Add(make_text(self, "🔗 友链管理", (14, True)), 0, wx.ALL, 12)
        self.sizer.Add(make_info(self, "无需写代码，用 GUI 可视化添加 / 编辑 / 删除友链。"), 0, wx.LEFT | wx.BOTTOM, 12)

        if not FRIENDS_ASTRO.exists():
            self.sizer.Add(make_info(self, "文件不存在: friends.astro"), 0, wx.ALL, 12)
            return

        # ---- 新增友链表单 ----
        self.sizer.Add(make_text(self, "➕ 新增友链", (12, True)), 0, wx.LEFT | wx.TOP, 12)

        form = wx.GridBagSizer(vgap=8, hgap=8)
        field_defs = [
            ("name", "站点名称 *"),
            ("url", "站点链接 *"),
            ("desc", "一句话描述"),
        ]
        self.fields = {}
        for i, (key, label) in enumerate(field_defs):
            lbl = wx.StaticText(self, label=label)
            lbl.SetFont(_ui_font(11, wx.FONTWEIGHT_BOLD))
            form.Add(lbl, (i, 0), flag=wx.ALIGN_CENTER_VERTICAL)
            inp = make_input(self, '', 380)
            form.Add(inp, (i, 1), flag=wx.EXPAND)
            self.fields[key] = inp

        # 头像
        lbl = wx.StaticText(self, label="头像链接")
        lbl.SetFont(_ui_font(11, wx.FONTWEIGHT_BOLD))
        form.Add(lbl, (3, 0), flag=wx.ALIGN_CENTER_VERTICAL)
        avatar_row = wx.BoxSizer(wx.HORIZONTAL)
        self.fields['avatar'] = make_input(self, '', 300)
        avatar_row.Add(self.fields['avatar'], 1, wx.EXPAND | wx.RIGHT, 6)
        pick_btn = make_button(self, "浏览…", COLOR_MUTED)
        pick_btn.Bind(wx.EVT_BUTTON, self._on_pick_avatar)
        avatar_row.Add(pick_btn, 0, wx.ALIGN_CENTER_VERTICAL)
        form.Add(avatar_row, (3, 1), flag=wx.EXPAND)

        # 聊聊为什么要互链
        tip = wx.StaticText(self, label="💡 建议头像用本地图片，例如 /my.jpg（放 public/ 下）或外链图片地址。")
        tip.SetFont(_ui_font(10))
        tip.SetForegroundColour(COLOR_MUTED)
        form.Add(tip, (4, 0), span=(1, 2), flag=wx.ALIGN_LEFT)

        self.sizer.Add(form, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        add_btn = make_button(self, "✅ 添加到友链", COLOR_SUCCESS)
        add_btn.Bind(wx.EVT_BUTTON, self._on_add_friend)
        self.sizer.Add(add_btn, 0, wx.LEFT | wx.BOTTOM, 12)

        # ---- 现有友链列表 ----
        self.sizer.Add(wx.StaticLine(self), 0, wx.EXPAND | wx.LEFT | wx.RIGHT, 8)
        self.sizer.Add(make_text(self, "现有友链", (12, True)), 0, wx.LEFT | wx.TOP | wx.BOTTOM, 12)

        self.friends = self._parse_friends(FRIENDS_ASTRO.read_text(encoding='utf-8'))
        if not self.friends:
            self.sizer.Add(make_info(self, "未解析到任何友链。"), 0, wx.LEFT | wx.BOTTOM, 12)
        for idx, fr in enumerate(self.friends):
            self.sizer.Add(self._make_friend_card(fr, idx), 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.TOP, 8)

        self.sizer.Add(make_info(self, "修改后记得去「🚀 部署管理」提交推送，页面才会更新。"),
                       0, wx.LEFT | wx.BOTTOM, 12)

    def _make_friend_card(self, fr, idx):
        card = wx.Panel(self)
        card.SetBackgroundColour(COLOR_PAPER)
        sizer = wx.BoxSizer(wx.HORIZONTAL)

        txt = wx.BoxSizer(wx.VERTICAL)
        name = wx.StaticText(card, label=f"{fr['name']}")
        name.SetFont(_ui_font(12, wx.FONTWEIGHT_BOLD))
        txt.Add(name, 0, wx.LEFT | wx.TOP, 8)
        desc = wx.StaticText(card, label=fr['desc'])
        desc.SetFont(_ui_font(10))
        desc.SetForegroundColour(COLOR_MUTED)
        txt.Add(desc, 0, wx.LEFT | wx.TOP, 2)
        url = wx.StaticText(card, label=fr['url'])
        url.SetFont(_ui_font(10))
        url.SetForegroundColour(COLOR_ACCENT)
        txt.Add(url, 0, wx.LEFT | wx.BOTTOM, 8)
        sizer.Add(txt, 1, wx.EXPAND)

        btn_s = wx.BoxSizer(wx.VERTICAL)
        btn_s.Add((0, 0), 1)
        edit_btn = make_button(card, "编辑", COLOR_ACCENT)
        edit_btn.SetMinSize((52, 28))
        edit_btn.Bind(wx.EVT_BUTTON, lambda e, i=idx: self._on_edit_friend(i))
        btn_s.Add(edit_btn, 0, wx.BOTTOM, 4)
        del_btn = make_button(card, "删除", COLOR_DANGER)
        del_btn.SetMinSize((52, 28))
        del_btn.Bind(wx.EVT_BUTTON, lambda e, i=idx: self._on_del_friend(i))
        btn_s.Add(del_btn, 0)
        sizer.Add(btn_s, 0, wx.ALL, 6)

        card.SetSizer(sizer)
        return card

    def _on_pick_avatar(self, e):
        dlg = wx.FileDialog(self, "选择头像图片", wildcard="图片文件 (*.jpg;*.png;*.gif;*.webp)|*.jpg;*.png;*.gif;*.webp",
                            style=wx.FD_OPEN | wx.FD_FILE_MUST_EXIST)
        if dlg.ShowModal() == wx.ID_OK:
            src = Path(dlg.GetPath())
            dlg.Destroy()
            # 复制到 public/ 并生成友链引用路径
            dest = PROJECT_ROOT / "public" / src.name
            try:
                shutil.copyfile(src, dest)
                self.fields['avatar'].SetValue(f"/{src.name}")
                wx.MessageBox(f"已复制头像到 public/{src.name}\n引用路径 /{src.name}", "完成", wx.OK | wx.ICON_INFORMATION)
            except Exception as ex:
                wx.MessageBox(f"复制失败: {ex}", "错误", wx.OK | wx.ICON_ERROR)
        else:
            dlg.Destroy()

    def _save_file(self):
        """根据 self.friends 重新生成 friends.astro"""
        raw = FRIENDS_ASTRO.read_text(encoding='utf-8')
        # 定位 friend-grid 块：从开始标签到紧随其后的 <h2>本站信息</h2> 之间的整个网格
        start = raw.find('<div class="friend-grid">')
        if start == -1:
            wx.MessageBox("无法定位 friend-grid，请手动编辑。", "错误", wx.OK | wx.ICON_ERROR)
            return False
        grid_open_end = start + len('<div class="friend-grid">')
        # 网格在 <h2> 之前结束（本站信息区块）
        h2_pos = raw.find('<h2>', grid_open_end)
        if h2_pos == -1:
            wx.MessageBox("无法定位网格结束位置，请手动编辑。", "错误", wx.OK | wx.ICON_ERROR)
            return False

        cards = []
        for fr in self.friends:
            cards.append(
                '      <div class="friend-card">\n'
                f'        <img src="{fr["avatar"]}" alt="头像" />\n'
                '        <div>\n'
                f'          <h3>{fr["name"]}</h3>\n'
                f'          <p>{fr["desc"]}</p>\n'
                f'          <a href="{fr["url"]}" target="_blank" rel="noopener">{fr["url_text"] or fr["url"]}</a>\n'
                '        </div>\n'
                '      </div>'
            )
        # 重新构造网格块（保持原有缩进和闭合 </div> 行）
        lines = raw[grid_open_end:h2_pos].split('\n')
        indent_close = ''
        for ln in lines:
            if 'friend-grid' not in ln and '</div>' in ln and ln.strip() == '</div>':
                indent_close = ln  # 网格闭合行（如 "    </div>"）
                break
        new_block = '<div class="friend-grid">\n' + '\n'.join(cards) + '\n' + indent_close + '\n'
        new_raw = raw[:start] + new_block + raw[h2_pos:]
        FRIENDS_ASTRO.write_text(new_raw, encoding='utf-8')
        return True

    def _on_add_friend(self, e):
        name = self.fields['name'].GetValue().strip()
        url = self.fields['url'].GetValue().strip()
        desc = self.fields['desc'].GetValue().strip()
        avatar = self.fields['avatar'].GetValue().strip() or '/my.jpg'
        if not name or not url:
            wx.MessageBox("站点名称和站点链接为必填项！", "错误", wx.OK | wx.ICON_ERROR)
            return
        self.friends.append({
            'avatar': avatar, 'name': name, 'desc': desc,
            'url': url, 'url_text': url,
        })
        if self._save_file():
            wx.MessageBox(f"已添加友链：{name}", "完成", wx.OK | wx.ICON_INFORMATION)
            self._rebuild()

    def _on_edit_friend(self, idx):
        fr = self.friends[idx]
        dlg = FriendDialog(self, fr)
        if dlg.ShowModal() == wx.ID_OK:
            data = dlg.get_data()
            self.friends[idx] = data
            if self._save_file():
                wx.MessageBox("友链已更新", "完成", wx.OK | wx.ICON_INFORMATION)
                self._rebuild()
        dlg.Destroy()

    def _on_del_friend(self, idx):
        name = self.friends[idx]['name']
        r = wx.MessageBox(f"确定删除友链「{name}」吗？", "确认删除", wx.YES_NO | wx.ICON_WARNING)
        if r == wx.YES:
            self.friends.pop(idx)
            if self._save_file():
                wx.MessageBox(f"已删除友链：{name}", "完成", wx.OK | wx.ICON_INFORMATION)
                self._rebuild()


class FriendDialog(wx.Dialog):
    def __init__(self, parent, data):
        super().__init__(parent, title=f"编辑友链: {data['name']}", size=(520, 520),
                         style=wx.DEFAULT_DIALOG_STYLE | wx.RESIZE_BORDER)
        outer = wx.BoxSizer(wx.VERTICAL)

        # 滚动区：放所有输入字段
        self.scroll = wx.ScrolledWindow(self)
        self.scroll.SetBackgroundColour(COLOR_PAPER)
        self.scroll.SetScrollRate(0, 15)
        panel = self.scroll
        sizer = wx.BoxSizer(wx.VERTICAL)

        self.inputs = {}
        for key, label in [
            ('name', '站点名称 *'),
            ('url', '站点链接 *'),
            ('url_text', '链接显示文字'),
            ('avatar', '头像链接'),
            ('desc', '一句话描述'),
        ]:
            sizer.Add(make_text(panel, label, (11, True)), 0, wx.LEFT | wx.TOP, 12)
            inp = make_input(panel, data.get(key, ''), 300)
            sizer.Add(inp, 0, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)
            self.inputs[key] = inp

        sizer.AddStretchSpacer()
        self.scroll.SetSizer(sizer)
        outer.Add(self.scroll, 1, wx.EXPAND)

        # 底部固定按钮条（始终可见）
        btn_bar = wx.Panel(self)
        btn_bar.SetBackgroundColour(COLOR_BG)
        btn_row = wx.BoxSizer(wx.HORIZONTAL)
        save_btn = make_button(btn_bar, "💾 保存")
        save_btn.Bind(wx.EVT_BUTTON, self._on_save)
        cancel_btn = make_button(btn_bar, "取消", COLOR_MUTED)
        cancel_btn.Bind(wx.EVT_BUTTON, lambda e: self.EndModal(wx.ID_CANCEL))
        btn_row.Add(save_btn, 0, wx.RIGHT, 8)
        btn_row.Add(cancel_btn, 0)
        top_sizer = wx.BoxSizer(wx.VERTICAL)
        top_sizer.Add(btn_row, 0, wx.ALL | wx.ALIGN_RIGHT, 12)
        btn_bar.SetSizer(top_sizer)
        outer.Add(btn_bar, 0, wx.EXPAND)

        self.SetSizer(outer)
        self.scroll.FitInside()

    def _on_save(self, e):
        if not self.inputs['name'].GetValue().strip() or not self.inputs['url'].GetValue().strip():
            wx.MessageBox("站点名称和站点链接为必填项！", "错误", wx.OK | wx.ICON_ERROR)
            return
        self.EndModal(wx.ID_OK)

    def get_data(self):
        return {k: self.inputs[k].GetValue().strip() for k in self.inputs}



# ═══════════════════════════════════════════════════════════
#  全局样式面板
# ═══════════════════════════════════════════════════════════

class StylesPanel(ScrollPanel):
    def __init__(self, parent):
        super().__init__(parent)
        self.sizer = wx.BoxSizer(wx.VERTICAL)
        self.SetSizer(self.sizer)
        self._build()
        self.Layout()
        self.SetupScrolling(scroll_x=False)

    def _build(self):
        self.sizer.Clear(True)
        self.sizer.Add(make_text(self, "🎨 全局样式", (14, True)), 0, wx.ALL, 12)
        self.sizer.Add(make_info(self, "编辑 src/styles/global.css 中的全局 CSS 样式。"), 0, wx.LEFT | wx.BOTTOM, 12)

        if not GLOBAL_CSS.exists():
            self.sizer.Add(make_info(self, "文件不存在: global.css"), 0, wx.ALL, 12)
            return

        text = GLOBAL_CSS.read_text(encoding='utf-8')

        self.editor = wx.TextCtrl(self, value=text, style=wx.TE_MULTILINE | wx.TE_DONTWRAP,
                                  size=(-1, 450))
        self.editor.SetFont(_ui_font(11, mono=True))
        self.sizer.Add(self.editor, 1, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 12)

        btn_row = wx.BoxSizer(wx.HORIZONTAL)
        save_btn = make_button(self, "💾 保存 global.css")
        save_btn.Bind(wx.EVT_BUTTON, self._on_save)
        reset_btn = make_button(self, "↩️ 重新加载", COLOR_MUTED)
        reset_btn.Bind(wx.EVT_BUTTON, lambda e: self._rebuild())
        btn_row.Add(save_btn, 0, wx.RIGHT, 8)
        btn_row.Add(reset_btn, 0)
        self.sizer.Add(btn_row, 0, wx.ALL | wx.ALIGN_RIGHT, 12)

        self.sizer.Add(make_text(self, "主题变量速查", (10, True)), 0, wx.LEFT | wx.TOP, 12)
        vars_info = [
            "--bg        页面背景色",
            "--paper     卡片/内容背景",
            "--accent    主题强调色",
            "--text      正文文字色",
            "--muted     次要文字色",
            "--border    边框颜色",
            "--sidebar   侧边栏背景",
            "--topbar-bg 顶栏背景",
        ]
        for v in vars_info:
            self.sizer.Add(make_info(self, v), 0, wx.LEFT, 16)

    def _on_save(self, e):
        content = self.editor.GetValue()
        GLOBAL_CSS.write_text(content, encoding='utf-8')
        wx.MessageBox("global.css 已保存！", "完成", wx.OK | wx.ICON_INFORMATION)


# ═══════════════════════════════════════════════════════════
#  主窗口
# ═══════════════════════════════════════════════════════════

class MainFrame(wx.Frame):
    PANELS = {
        'articles':  ArticlesPanel,
        'resources': ResourcesPanel,
        'encrypt':   EncryptPanel,
        'settings':  SiteSettingsPanel,
        'deploy':    DeployPanel,
        'friends':   FriendsPanel,
        'styles':    StylesPanel,
    }

    def __init__(self):
        super().__init__(None, title="AI极客之家 · 网站管理工具",
                         size=(1000, 680))
        self.SetMinSize((780, 520))

        main_sizer = wx.BoxSizer(wx.HORIZONTAL)

        self.left = LeftPanel(self, self._on_nav)
        main_sizer.Add(self.left, 0, wx.EXPAND)

        self.right = wx.Panel(self)
        self.right.SetBackgroundColour(COLOR_BG)
        self.right_sizer = wx.BoxSizer(wx.VERTICAL)
        self.right.SetSizer(self.right_sizer)
        main_sizer.Add(self.right, 1, wx.EXPAND)

        self.SetSizer(main_sizer)

        self.current_key = None
        self.current_panel = None

        self._on_nav('articles')
        self.Centre()

    def _on_nav(self, key):
        if key == self.current_key:
            return
        self.current_key = key

        if self.current_panel:
            self.right_sizer.Detach(self.current_panel)
            self.current_panel.Destroy()

        cls = self.PANELS.get(key)
        if cls:
            self.current_panel = cls(self.right)
        else:
            self.current_panel = wx.Panel(self.right)

        self.right_sizer.Add(self.current_panel, 1, wx.EXPAND)
        self.right.Layout()


# ═══════════════════════════════════════════════════════════
#  启动
# ═══════════════════════════════════════════════════════════

if __name__ == '__main__':
    app = wx.App(False)
    frame = MainFrame()
    frame.Show()
    app.MainLoop()
