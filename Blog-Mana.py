#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI-new 网站维护一体化工具
基于 wxPython 构建，用于管理 Astro + bun 项目的文章、资源和部署
"""

import wx
import wx.lib.mixins.listctrl as listmix
import os
import sys
import json
import subprocess
import shutil
import hashlib
import base64
from pathlib import Path
from datetime import datetime
import threading
import time
import re
import webbrowser

# ==================== 配置 ====================
if getattr(sys, 'frozen', False):
    PROJECT_ROOT = Path(sys.executable).parent
else:
    script_path = Path(__file__).resolve()
    if script_path.parent.name == 'scripts':
        PROJECT_ROOT = script_path.parent.parent
    else:
        PROJECT_ROOT = script_path.parent

CONTENT_DIR = PROJECT_ROOT / 'src' / 'content' / 'posts'
ENCRYPTED_DIR = PROJECT_ROOT / 'public' / 'encrypted'
DATA_FILE = PROJECT_ROOT / 'src' / 'data' / 'articles.json'
SCRIPTS_DIR = PROJECT_ROOT / 'scripts'

# ==================== 工具函数 ====================
def get_articles():
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return []
    return []

def save_articles(articles):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)

def run_command(cmd, cwd=None, capture=True):
    try:
        if capture:
            result = subprocess.run(cmd, shell=True, cwd=cwd or PROJECT_ROOT,
                                   capture_output=True, text=True, encoding='utf-8',
                                   errors='ignore')
            return result.stdout + result.stderr, result.returncode == 0
        else:
            subprocess.Popen(cmd, shell=True, cwd=cwd or PROJECT_ROOT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return "进程已启动", True
    except Exception as e:
        return str(e), False

def get_md_files():
    if not CONTENT_DIR.exists():
        return []
    return list(CONTENT_DIR.glob('*.md'))

def parse_frontmatter(content):
    pattern = r'^---\s*\n(.*?)\n---\s*\n(.*)$'
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        return {}, content

    frontmatter_text = match.group(1)
    body = match.group(2)

    data = {}
    for line in frontmatter_text.split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()
            if value.lower() in ['true', 'false']:
                data[key] = value.lower() == 'true'
            elif value.isdigit():
                data[key] = int(value)
            else:
                if (value.startswith('"') and value.endswith('"')) or \
                   (value.startswith("'") and value.endswith("'")):
                    value = value[1:-1]
                data[key] = value
    return data, body

def get_article_info(md_path):
    try:
        with open(md_path, 'r', encoding='utf-8') as f:
            content = f.read()
        frontmatter, body = parse_frontmatter(content)

        slug = md_path.stem
        return {
            'slug': slug,
            'title': frontmatter.get('title', slug),
            'date': frontmatter.get('date', datetime.now().strftime('%Y-%m-%d')),
            'category': frontmatter.get('category', '未分类'),
            'tags': frontmatter.get('tags', []),
            'description': frontmatter.get('description', ''),
            'type': frontmatter.get('type', 'article'),
            'access': frontmatter.get('access', 'public'),
            'hot': frontmatter.get('hot', False),
            'origin': frontmatter.get('origin', 'original'),
            'path': str(md_path),
            'protected': frontmatter.get('access') == 'protected'
        }
    except Exception as e:
        return None

# ==================== 文章编辑对话框 ====================
class ArticleEditDialog(wx.Dialog):
    def __init__(self, parent, article_data=None, is_new=False):
        super().__init__(parent, title="编辑文章" if not is_new else "新建文章",
                        size=(600, 500))

        self.article_data = article_data or {}
        self.is_new = is_new
        self.result_data = None

        panel = wx.Panel(self)
        sizer = wx.BoxSizer(wx.VERTICAL)

        # 基本信息分组
        info_box = wx.StaticBox(panel, label="基本信息")
        info_sizer = wx.StaticBoxSizer(info_box, wx.VERTICAL)
        grid_sizer = wx.FlexGridSizer(rows=0, cols=2, vgap=8, hgap=10)
        grid_sizer.AddGrowableCol(1, 1)

        # 标题
        grid_sizer.Add(wx.StaticText(panel, label="标题:*"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.title_ctrl = wx.TextCtrl(panel)
        if article_data:
            self.title_ctrl.SetValue(article_data.get('title', ''))
        grid_sizer.Add(self.title_ctrl, 1, wx.EXPAND)

        # Slug (文件名)
        grid_sizer.Add(wx.StaticText(panel, label="文件名:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.slug_ctrl = wx.TextCtrl(panel)
        if article_data:
            self.slug_ctrl.SetValue(article_data.get('slug', ''))
        self.slug_ctrl.SetEditable(not is_new)  # 新建时可编辑
        grid_sizer.Add(self.slug_ctrl, 1, wx.EXPAND)

        # 分类
        grid_sizer.Add(wx.StaticText(panel, label="分类:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.category_ctrl = wx.TextCtrl(panel)
        if article_data:
            self.category_ctrl.SetValue(article_data.get('category', '未分类'))
        else:
            self.category_ctrl.SetValue('未分类')
        grid_sizer.Add(self.category_ctrl, 1, wx.EXPAND)

        # 日期
        grid_sizer.Add(wx.StaticText(panel, label="日期:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.date_ctrl = wx.TextCtrl(panel)
        if article_data:
            self.date_ctrl.SetValue(article_data.get('date', datetime.now().strftime('%Y-%m-%d')))
        else:
            self.date_ctrl.SetValue(datetime.now().strftime('%Y-%m-%d'))
        grid_sizer.Add(self.date_ctrl, 1, wx.EXPAND)

        # 类型
        grid_sizer.Add(wx.StaticText(panel, label="类型:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        type_choices = ['article', 'resource', 'page']
        self.type_choice = wx.Choice(panel, choices=type_choices)
        current_type = article_data.get('type', 'article') if article_data else 'article'
        self.type_choice.SetSelection(type_choices.index(current_type))
        grid_sizer.Add(self.type_choice, 1, wx.EXPAND)

        # 来源
        grid_sizer.Add(wx.StaticText(panel, label="来源:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        origin_choices = ['original', 'repost']
        self.origin_choice = wx.Choice(panel, choices=origin_choices)
        current_origin = article_data.get('origin', 'original') if article_data else 'original'
        self.origin_choice.SetSelection(origin_choices.index(current_origin))
        grid_sizer.Add(self.origin_choice, 1, wx.EXPAND)

        info_sizer.Add(grid_sizer, 1, wx.EXPAND | wx.ALL, 10)
        sizer.Add(info_sizer, 0, wx.EXPAND | wx.ALL, 5)

        # 选项分组
        opt_box = wx.StaticBox(panel, label="选项")
        opt_sizer = wx.StaticBoxSizer(opt_box, wx.VERTICAL)

        opt_grid = wx.FlexGridSizer(rows=0, cols=2, vgap=5, hgap=20)

        # 热门标记 (True/False 二选一)
        opt_grid.Add(wx.StaticText(panel, label="热门:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        hot_choices = ['False', 'True']
        self.hot_choice = wx.Choice(panel, choices=hot_choices)
        is_hot = article_data.get('hot', False) if article_data else False
        self.hot_choice.SetSelection(1 if is_hot else 0)
        opt_grid.Add(self.hot_choice, 0, wx.EXPAND)

        # 加密状态 (True/False 二选一)
        opt_grid.Add(wx.StaticText(panel, label="加密:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        encrypt_choices = ['False', 'True']
        self.encrypt_choice = wx.Choice(panel, choices=encrypt_choices)
        is_encrypted = article_data.get('access') == 'protected' if article_data else False
        self.encrypt_choice.SetSelection(1 if is_encrypted else 0)
        self.encrypt_choice.Bind(wx.EVT_CHOICE, self.on_encrypt_change)
        opt_grid.Add(self.encrypt_choice, 0, wx.EXPAND)

        # 密码输入 (仅在加密时显示)
        opt_grid.Add(wx.StaticText(panel, label="密码:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.password_ctrl = wx.TextCtrl(panel, style=wx.TE_PASSWORD)
        if is_encrypted:
            self.password_ctrl.Enable()
        else:
            self.password_ctrl.Disable()
        opt_grid.Add(self.password_ctrl, 1, wx.EXPAND)

        opt_sizer.Add(opt_grid, 1, wx.EXPAND | wx.ALL, 10)
        sizer.Add(opt_sizer, 0, wx.EXPAND | wx.ALL, 5)

        # 描述
        desc_box = wx.StaticBox(panel, label="描述")
        desc_sizer = wx.StaticBoxSizer(desc_box, wx.VERTICAL)
        self.desc_ctrl = wx.TextCtrl(panel, style=wx.TE_MULTILINE, size=(-1, 60))
        if article_data:
            self.desc_ctrl.SetValue(article_data.get('description', ''))
        desc_sizer.Add(self.desc_ctrl, 1, wx.EXPAND | wx.ALL, 5)
        sizer.Add(desc_sizer, 1, wx.EXPAND | wx.ALL, 5)

        # 按钮
        btn_sizer = wx.BoxSizer(wx.HORIZONTAL)
        save_btn = wx.Button(panel, wx.ID_SAVE, "保存")
        save_btn.Bind(wx.EVT_BUTTON, self.on_save)
        cancel_btn = wx.Button(panel, wx.ID_CANCEL, "取消")
        btn_sizer.Add(save_btn, 0, wx.RIGHT, 5)
        btn_sizer.Add(cancel_btn)
        sizer.Add(btn_sizer, 0, wx.ALIGN_CENTER | wx.ALL, 10)

        panel.SetSizer(sizer)
        self.Fit()
        self.Center()

    def on_encrypt_change(self, event):
        """加密选项变化时启用/禁用密码输入"""
        is_encrypted = self.encrypt_choice.GetSelection() == 1
        self.password_ctrl.Enable(is_encrypted)
        if not is_encrypted:
            self.password_ctrl.SetValue('')

    def on_save(self, event):
        """保存文章信息"""
        title = self.title_ctrl.GetValue().strip()
        if not title:
            wx.MessageBox("请输入标题", "提示", wx.OK | wx.ICON_WARNING)
            return

        slug = self.slug_ctrl.GetValue().strip()
        if not slug:
            # 自动生成slug
            slug = title.lower().replace(' ', '-')
            slug = re.sub(r'[^a-z0-9\-]', '', slug)

        is_encrypted = self.encrypt_choice.GetSelection() == 1
        if is_encrypted:
            password = self.password_ctrl.GetValue().strip()
            if not password:
                wx.MessageBox("加密文章需要设置密码", "提示", wx.OK | wx.ICON_WARNING)
                return

        self.result_data = {
            'title': title,
            'slug': slug,
            'category': self.category_ctrl.GetValue().strip() or '未分类',
            'date': self.date_ctrl.GetValue().strip() or datetime.now().strftime('%Y-%m-%d'),
            'type': self.type_choice.GetString(self.type_choice.GetSelection()),
            'origin': self.origin_choice.GetString(self.origin_choice.GetSelection()),
            'hot': self.hot_choice.GetSelection() == 1,
            'access': 'protected' if is_encrypted else 'public',
            'password': self.password_ctrl.GetValue().strip() if is_encrypted else '',
            'description': self.desc_ctrl.GetValue().strip()
        }

        self.EndModal(wx.ID_OK)

# ==================== 主窗口 ====================
class MainFrame(wx.Frame):
    def __init__(self):
        super().__init__(None, title="AI-new 网站维护工具",
                        size=(1100, 700),
                        style=wx.DEFAULT_FRAME_STYLE | wx.MAXIMIZE)

        # 创建菜单栏
        self._create_menu_bar()

        # 创建状态栏
        self.statusbar = self.CreateStatusBar()
        self.statusbar.SetStatusText("就绪")

        # 创建主面板
        main_panel = wx.Panel(self)
        main_sizer = wx.BoxSizer(wx.HORIZONTAL)

        # 左侧面板 - 文章列表
        left_panel = wx.Panel(main_panel, size=(380, -1))
        left_sizer = wx.BoxSizer(wx.VERTICAL)

        # 工具栏
        tool_sizer = wx.BoxSizer(wx.HORIZONTAL)
        self.new_btn = wx.Button(left_panel, label="📄 新建", size=(80, 30))
        self.new_btn.Bind(wx.EVT_BUTTON, self.on_new_article)
        tool_sizer.Add(self.new_btn, 0, wx.RIGHT, 5)

        self.refresh_btn = wx.Button(left_panel, label="🔄 刷新", size=(80, 30))
        self.refresh_btn.Bind(wx.EVT_BUTTON, self.on_refresh)
        tool_sizer.Add(self.refresh_btn, 0, wx.RIGHT, 5)

        self.encrypt_btn = wx.Button(left_panel, label="🔒 加密", size=(80, 30))
        self.encrypt_btn.Bind(wx.EVT_BUTTON, self.on_encrypt)
        tool_sizer.Add(self.encrypt_btn)

        left_sizer.Add(tool_sizer, 0, wx.ALL, 10)

        # 搜索框
        search_sizer = wx.BoxSizer(wx.HORIZONTAL)
        self.search_input = wx.TextCtrl(left_panel, style=wx.TE_PROCESS_ENTER)
        self.search_input.SetHint("搜索文章...")
        self.search_input.Bind(wx.EVT_TEXT_ENTER, self.on_search)
        search_sizer.Add(self.search_input, 1, wx.EXPAND)
        left_sizer.Add(search_sizer, 0, wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)

        # 文章列表
        self.article_list = wx.ListCtrl(left_panel, style=wx.LC_REPORT | wx.LC_SINGLE_SEL)
        self.article_list.AppendColumn("标题", width=180)
        self.article_list.AppendColumn("类型", width=50)
        self.article_list.AppendColumn("状态", width=50)
        self.article_list.AppendColumn("日期", width=80)
        self.article_list.Bind(wx.EVT_LIST_ITEM_SELECTED, self.on_article_select)
        self.article_list.Bind(wx.EVT_LIST_ITEM_ACTIVATED, self.on_article_activate)
        left_sizer.Add(self.article_list, 1, wx.EXPAND | wx.LEFT | wx.RIGHT | wx.BOTTOM, 10)

        left_panel.SetSizer(left_sizer)
        main_sizer.Add(left_panel, 0, wx.EXPAND)

        # 右侧面板
        right_panel = wx.Panel(main_panel)
        right_sizer = wx.BoxSizer(wx.VERTICAL)

        # 文章信息显示
        info_box = wx.StaticBox(right_panel, label="文章信息")
        info_sizer = wx.StaticBoxSizer(info_box, wx.VERTICAL)

        grid_sizer = wx.FlexGridSizer(rows=0, cols=2, vgap=5, hgap=10)
        grid_sizer.AddGrowableCol(1, 1)

        grid_sizer.Add(wx.StaticText(right_panel, label="标题:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.title_text = wx.TextCtrl(right_panel, style=wx.TE_READONLY)
        grid_sizer.Add(self.title_text, 1, wx.EXPAND)

        grid_sizer.Add(wx.StaticText(right_panel, label="分类:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.category_text = wx.TextCtrl(right_panel, style=wx.TE_READONLY)
        grid_sizer.Add(self.category_text, 1, wx.EXPAND)

        grid_sizer.Add(wx.StaticText(right_panel, label="类型:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.type_text = wx.TextCtrl(right_panel, style=wx.TE_READONLY)
        grid_sizer.Add(self.type_text, 1, wx.EXPAND)

        grid_sizer.Add(wx.StaticText(right_panel, label="日期:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.date_text = wx.TextCtrl(right_panel, style=wx.TE_READONLY)
        grid_sizer.Add(self.date_text, 1, wx.EXPAND)

        grid_sizer.Add(wx.StaticText(right_panel, label="热门:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.hot_text = wx.TextCtrl(right_panel, style=wx.TE_READONLY)
        grid_sizer.Add(self.hot_text, 1, wx.EXPAND)

        grid_sizer.Add(wx.StaticText(right_panel, label="加密:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_CENTER_VERTICAL)
        self.access_text = wx.TextCtrl(right_panel, style=wx.TE_READONLY)
        grid_sizer.Add(self.access_text, 1, wx.EXPAND)

        grid_sizer.Add(wx.StaticText(right_panel, label="描述:"), 0, wx.ALIGN_RIGHT | wx.ALIGN_TOP)
        self.desc_text = wx.TextCtrl(right_panel, style=wx.TE_READONLY | wx.TE_MULTILINE, size=(-1, 60))
        grid_sizer.Add(self.desc_text, 1, wx.EXPAND)

        info_sizer.Add(grid_sizer, 1, wx.EXPAND | wx.ALL, 10)
        right_sizer.Add(info_sizer, 0, wx.EXPAND | wx.ALL, 5)

        # 操作按钮
        btn_sizer = wx.BoxSizer(wx.HORIZONTAL)
        self.edit_btn = wx.Button(right_panel, label="✏️ 编辑", size=(100, 35))
        self.edit_btn.Bind(wx.EVT_BUTTON, self.on_edit_article)
        self.edit_btn.Disable()
        btn_sizer.Add(self.edit_btn, 0, wx.RIGHT, 5)

        self.delete_btn = wx.Button(right_panel, label="🗑️ 删除", size=(100, 35))
        self.delete_btn.Bind(wx.EVT_BUTTON, self.on_delete_article)
        self.delete_btn.Disable()
        btn_sizer.Add(self.delete_btn, 0, wx.RIGHT, 5)

        self.preview_btn = wx.Button(right_panel, label="👁️ 预览", size=(100, 35))
        self.preview_btn.Bind(wx.EVT_BUTTON, self.on_preview_article)
        self.preview_btn.Disable()
        btn_sizer.Add(self.preview_btn)

        right_sizer.Add(btn_sizer, 0, wx.ALL, 10)

        # 控制台
        console_box = wx.StaticBox(right_panel, label="控制台")
        console_sizer = wx.StaticBoxSizer(console_box, wx.VERTICAL)

        self.console = wx.TextCtrl(right_panel, style=wx.TE_MULTILINE | wx.TE_READONLY,
                                   size=(-1, 200))
        self.console.SetBackgroundColour('#1e1e1e')
        self.console.SetForegroundColour('#d4d4d4')
        console_font = wx.Font(10, wx.FONTFAMILY_MODERN, wx.FONTSTYLE_NORMAL, wx.FONTWEIGHT_NORMAL)
        self.console.SetFont(console_font)
        console_sizer.Add(self.console, 1, wx.EXPAND | wx.ALL, 5)

        # 控制台按钮
        console_btn_sizer = wx.BoxSizer(wx.HORIZONTAL)
        self.build_btn = wx.Button(right_panel, label="🔨 构建", size=(100, 35))
        self.build_btn.Bind(wx.EVT_BUTTON, self.on_build)
        console_btn_sizer.Add(self.build_btn, 0, wx.RIGHT, 5)

        self.deploy_btn = wx.Button(right_panel, label="🚀 部署", size=(100, 35))
        self.deploy_btn.Bind(wx.EVT_BUTTON, self.on_deploy)
        console_btn_sizer.Add(self.deploy_btn, 0, wx.RIGHT, 5)

        self.dev_btn = wx.Button(right_panel, label="▶️ 预览模式", size=(100, 35))
        self.dev_btn.Bind(wx.EVT_BUTTON, self.on_dev_server)
        console_btn_sizer.Add(self.dev_btn, 0, wx.RIGHT, 5)

        self.console_clear_btn = wx.Button(right_panel, label="清空", size=(60, 35))
        self.console_clear_btn.Bind(wx.EVT_BUTTON, self.on_console_clear)
        console_btn_sizer.Add(self.console_clear_btn)

        console_sizer.Add(console_btn_sizer, 0, wx.ALL, 5)
        right_sizer.Add(console_sizer, 1, wx.EXPAND | wx.ALL, 5)

        right_panel.SetSizer(right_sizer)
        main_sizer.Add(right_panel, 1, wx.EXPAND | wx.ALL, 5)

        main_panel.SetSizer(main_sizer)

        # 数据
        self.articles = []
        self.current_slug = None

        # 加载数据
        self.load_articles()

        # 绑定关闭事件
        self.Bind(wx.EVT_CLOSE, self.on_close)

        # 初始化完成
        self.log("✅ 工具初始化完成")
        self.log(f"📁 项目目录: {PROJECT_ROOT}")
        self.log(f"📄 文章目录: {CONTENT_DIR}")
        self.log(f"📊 文章数量: {len(self.articles)}")

    def _create_menu_bar(self):
        menubar = wx.MenuBar()

        file_menu = wx.Menu()
        new_item = file_menu.Append(wx.ID_NEW, "新建文章\tCtrl+N")
        self.Bind(wx.EVT_MENU, self.on_new_article, new_item)
        file_menu.AppendSeparator()
        refresh_item = file_menu.Append(wx.ID_REFRESH, "刷新列表\tCtrl+R")
        self.Bind(wx.EVT_MENU, self.on_refresh, refresh_item)
        file_menu.AppendSeparator()
        exit_item = file_menu.Append(wx.ID_EXIT, "退出\tCtrl+Q")
        self.Bind(wx.EVT_MENU, self.on_close, exit_item)
        menubar.Append(file_menu, "文件")

        tool_menu = wx.Menu()
        encrypt_item = tool_menu.Append(wx.ID_ANY, "加密受保护文章")
        self.Bind(wx.EVT_MENU, self.on_encrypt, encrypt_item)
        tool_menu.AppendSeparator()
        build_item = tool_menu.Append(wx.ID_ANY, "构建站点")
        self.Bind(wx.EVT_MENU, self.on_build, build_item)
        deploy_item = tool_menu.Append(wx.ID_ANY, "部署到GitHub")
        self.Bind(wx.EVT_MENU, self.on_deploy, deploy_item)
        menubar.Append(tool_menu, "工具")

        help_menu = wx.Menu()
        about_item = help_menu.Append(wx.ID_ABOUT, "关于")
        self.Bind(wx.EVT_MENU, self.on_about, about_item)
        menubar.Append(help_menu, "帮助")

        self.SetMenuBar(menubar)

    def log(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_msg = f"[{timestamp}] {message}\n"
        self.console.AppendText(log_msg)
        self.console.ShowPosition(self.console.GetLastPosition())
        if "✅" in message or "❌" in message:
            self.statusbar.SetStatusText(message[:50])

    def load_articles(self):
        self.articles = []
        self.article_list.DeleteAllItems()

        md_files = get_md_files()
        for md_file in md_files:
            info = get_article_info(md_file)
            if info:
                self.articles.append(info)

        self.articles.sort(key=lambda x: x['date'], reverse=True)

        for i, article in enumerate(self.articles):
            idx = self.article_list.InsertItem(i, article['title'])

            type_label = '📄' if article['type'] == 'article' else '📦'
            if article['type'] == 'page':
                type_label = '📋'
            self.article_list.SetItem(idx, 1, type_label)

            # 状态: 公开/加密
            status = '🔓' if article['access'] == 'public' else '🔒'
            self.article_list.SetItem(idx, 2, status)
            self.article_list.SetItem(idx, 3, article['date'])

        self.log(f"📚 加载了 {len(self.articles)} 篇文章")
        self.statusbar.SetStatusText(f"共 {len(self.articles)} 篇文章")

    def display_article_info(self, slug):
        article = next((a for a in self.articles if a['slug'] == slug), None)
        if not article:
            return

        self.current_slug = slug
        self.title_text.SetValue(article['title'])
        self.category_text.SetValue(article['category'])
        self.type_text.SetValue(article['type'])
        self.date_text.SetValue(article['date'])
        self.hot_text.SetValue('✅ 是' if article['hot'] else '❌ 否')
        self.access_text.SetValue('🔒 加密' if article['access'] == 'protected' else '🔓 公开')
        self.desc_text.SetValue(article['description'])

        self.edit_btn.Enable()
        self.delete_btn.Enable()
        self.preview_btn.Enable()

    def on_article_select(self, event):
        index = event.GetIndex()
        if 0 <= index < len(self.articles):
            self.display_article_info(self.articles[index]['slug'])

    def on_article_activate(self, event):
        index = event.GetIndex()
        if 0 <= index < len(self.articles):
            self.current_slug = self.articles[index]['slug']
            self.on_edit_article(None)

    def on_new_article(self, event):
        """新建文章 - 使用对话框"""
        dlg = ArticleEditDialog(self, is_new=True)
        if dlg.ShowModal() == wx.ID_OK:
            data = dlg.result_data

            # 检查slug是否已存在
            md_path = CONTENT_DIR / f"{data['slug']}.md"
            if md_path.exists():
                wx.MessageBox(f"文章 {data['slug']} 已存在", "提示", wx.OK | wx.ICON_WARNING)
                return

            # 生成markdown内容
            content = f"""---
title: {data['title']}
date: {data['date']}
category: {data['category']}
tags: []
description: {data['description']}
type: {data['type']}
access: {data['access']}
origin: {data['origin']}
hot: {str(data['hot']).lower()}
---
# {data['title']}

正文内容...
"""
            try:
                CONTENT_DIR.mkdir(parents=True, exist_ok=True)
                md_path.write_text(content, encoding='utf-8')
                self.log(f"✅ 创建文章: {data['slug']}")

                # 如果是加密文章，运行加密
                if data['access'] == 'protected' and data['password']:
                    # 更新frontmatter添加密码
                    self._update_md_password(data['slug'], data['password'])
                    self.log(f"🔒 加密文章: {data['slug']}")

                self.load_articles()
                self.current_slug = data['slug']
                self.display_article_info(data['slug'])

                wx.MessageBox(f"文章 '{data['title']}' 创建成功！", "提示", wx.OK | wx.ICON_INFORMATION)
            except Exception as e:
                wx.MessageBox(f"创建失败: {e}", "错误", wx.OK | wx.ICON_ERROR)
        dlg.Destroy()

    def _update_md_password(self, slug, password):
        """更新md文件的密码字段"""
        md_path = CONTENT_DIR / f"{slug}.md"
        if not md_path.exists():
            return

        with open(md_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # 检查是否已有password字段
        pattern = r'^(---\s*\n)(.*?)(\n---\s*\n)(.*)$'
        match = re.search(pattern, content, re.DOTALL)
        if match:
            frontmatter = match.group(2)
            body = match.group(4)

            # 添加或更新password
            if 'password:' in frontmatter:
                frontmatter = re.sub(r'password:.*', f'password: "{password}"', frontmatter)
            else:
                frontmatter += f'\npassword: "{password}"'

            new_content = f"---\n{frontmatter}\n---\n{body}"
            md_path.write_text(new_content, encoding='utf-8')

    def on_edit_article(self, event):
        """编辑文章 - 使用对话框"""
        if not self.current_slug:
            wx.MessageBox("请先选择一篇文章", "提示", wx.OK | wx.ICON_WARNING)
            return

        article = next((a for a in self.articles if a['slug'] == self.current_slug), None)
        if not article:
            return

        dlg = ArticleEditDialog(self, article)
        if dlg.ShowModal() == wx.ID_OK:
            data = dlg.result_data

            # 如果slug改变了，需要重命名文件
            old_path = CONTENT_DIR / f"{article['slug']}.md"
            new_path = CONTENT_DIR / f"{data['slug']}.md"

            if data['slug'] != article['slug'] and new_path.exists():
                wx.MessageBox(f"文件名 {data['slug']} 已存在", "提示", wx.OK | wx.ICON_WARNING)
                return

            # 更新markdown文件
            try:
                with open(old_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # 更新frontmatter
                pattern = r'^(---\s*\n)(.*?)(\n---\s*\n)(.*)$'
                match = re.search(pattern, content, re.DOTALL)
                if match:
                    frontmatter = match.group(2)
                    body = match.group(4)

                    # 更新各个字段
                    fields = {
                        'title': data['title'],
                        'date': data['date'],
                        'category': data['category'],
                        'description': data['description'],
                        'type': data['type'],
                        'access': data['access'],
                        'origin': data['origin'],
                        'hot': str(data['hot']).lower()
                    }

                    for key, value in fields.items():
                        if key in frontmatter:
                            frontmatter = re.sub(rf'{key}:.*', f'{key}: "{value}"', frontmatter)
                        else:
                            frontmatter += f'\n{key}: "{value}"'

                    # 处理密码
                    if data['access'] == 'protected' and data['password']:
                        if 'password:' in frontmatter:
                            frontmatter = re.sub(r'password:.*', f'password: "{data["password"]}"', frontmatter)
                        else:
                            frontmatter += f'\npassword: "{data["password"]}"'
                    elif 'password:' in frontmatter:
                        frontmatter = re.sub(r'password:.*', 'password: ""', frontmatter)

                    new_content = f"---\n{frontmatter}\n---\n{body}"

                    # 如果slug改变，重命名文件
                    if data['slug'] != article['slug']:
                        old_path.rename(new_path)
                        self.log(f"📝 重命名: {article['slug']} -> {data['slug']}")

                    new_path.write_text(new_content, encoding='utf-8')
                    self.log(f"✅ 更新文章: {data['slug']}")

                    # 如果是加密文章，重新加密
                    if data['access'] == 'protected':
                        self.on_encrypt(None)

                    self.load_articles()
                    self.current_slug = data['slug']
                    self.display_article_info(data['slug'])

                    wx.MessageBox("文章更新成功！", "提示", wx.OK | wx.ICON_INFORMATION)
            except Exception as e:
                wx.MessageBox(f"更新失败: {e}", "错误", wx.OK | wx.ICON_ERROR)

        dlg.Destroy()

    def on_delete_article(self, event):
        if not self.current_slug:
            wx.MessageBox("请先选择一篇文章", "提示", wx.OK | wx.ICON_WARNING)
            return

        article = next((a for a in self.articles if a['slug'] == self.current_slug), None)
        if not article:
            return

        dlg = wx.MessageDialog(self,
            f"确认删除文章 '{article['title']}'？\n\n此操作不可撤销！",
            "确认删除", wx.YES_NO | wx.ICON_WARNING)

        if dlg.ShowModal() == wx.ID_YES:
            md_path = CONTENT_DIR / f"{self.current_slug}.md"
            encrypted_path = ENCRYPTED_DIR / f"{self.current_slug}.json"

            try:
                if md_path.exists():
                    md_path.unlink()
                    self.log(f"🗑️ 删除文章: {self.current_slug}")

                if encrypted_path.exists():
                    encrypted_path.unlink()
                    self.log(f"🗑️ 删除加密文件: {self.current_slug}.json")

                self.on_encrypt(None)
                self.load_articles()
                self.clear_article_info()
                wx.MessageBox("删除成功", "提示", wx.OK | wx.ICON_INFORMATION)
            except Exception as e:
                wx.MessageBox(f"删除失败: {e}", "错误", wx.OK | wx.ICON_ERROR)
        dlg.Destroy()

    def on_preview_article(self, event):
        if not self.current_slug:
            wx.MessageBox("请先选择一篇文章", "提示", wx.OK | wx.ICON_WARNING)
            return

        self.log(f"🔍 预览文章: {self.current_slug}")
        url = f"http://localhost:4321/articles/{self.current_slug}"
        webbrowser.open(url)
        self.log(f"🌐 打开浏览器: {url}")

    def on_dev_server(self, event):
        self.log("🚀 启动开发服务器...")

        def dev_thread():
            try:
                check, _ = run_command("bun --version")
                if not check:
                    self.log("❌ bun 未安装或不在PATH中")
                    wx.CallAfter(wx.MessageBox, "bun 未安装或不在PATH中", "错误", wx.OK | wx.ICON_ERROR)
                    return

                self.log("▶️ 启动 dev 服务器 (http://localhost:4321)")
                process = subprocess.Popen(
                    "bun run dev",
                    shell=True,
                    cwd=PROJECT_ROOT,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    errors='ignore'
                )

                for line in process.stdout:
                    wx.CallAfter(self.log, line.strip())
                    if "localhost" in line:
                        wx.CallAfter(self._open_browser)

            except Exception as e:
                self.log(f"❌ 启动失败: {e}")

        thread = threading.Thread(target=dev_thread, daemon=True)
        thread.start()

    def _open_browser(self):
        webbrowser.open("http://localhost:4321")
        self.log("🌐 已打开浏览器")

    def clear_article_info(self):
        self.title_text.SetValue('')
        self.category_text.SetValue('')
        self.type_text.SetValue('')
        self.date_text.SetValue('')
        self.hot_text.SetValue('')
        self.access_text.SetValue('')
        self.desc_text.SetValue('')
        self.current_slug = None
        self.edit_btn.Disable()
        self.delete_btn.Disable()
        self.preview_btn.Disable()

    def on_refresh(self, event):
        self.load_articles()
        self.clear_article_info()
        self.log("🔄 已刷新")

    def on_search(self, event):
        keyword = self.search_input.GetValue().strip().lower()
        if not keyword:
            self.load_articles()
            return

        self.article_list.DeleteAllItems()
        filtered = [a for a in self.articles if keyword in a['title'].lower() or
                    keyword in a['description'].lower() or
                    keyword in a['category'].lower()]

        for i, article in enumerate(filtered):
            idx = self.article_list.InsertItem(i, article['title'])
            type_label = '📄' if article['type'] == 'article' else '📦'
            if article['type'] == 'page':
                type_label = '📋'
            self.article_list.SetItem(idx, 1, type_label)
            status = '🔓' if article['access'] == 'public' else '🔒'
            self.article_list.SetItem(idx, 2, status)
            self.article_list.SetItem(idx, 3, article['date'])

        self.log(f"🔍 搜索到 {len(filtered)} 篇文章")

    def on_encrypt(self, event):
        """运行加密脚本"""
        self.log("🔒 运行加密脚本...")
        self.statusbar.SetStatusText("正在加密...")

        encrypt_script = SCRIPTS_DIR / 'encrypt-content.ts'
        if not encrypt_script.exists():
            self.log("⚠️ 加密脚本不存在")
            wx.MessageBox("加密脚本不存在", "错误", wx.OK | wx.ICON_ERROR)
            return

        def encrypt_thread():
            try:
                output, success = run_command("bun run encrypt")
                for line in output.split('\n'):
                    if line.strip():
                        wx.CallAfter(self.log, line.strip())
                if success:
                    self.log("✅ 加密完成")
                    wx.CallAfter(self.load_articles)
                else:
                    self.log("❌ 加密失败")
            except Exception as e:
                self.log(f"❌ 异常: {e}")

        thread = threading.Thread(target=encrypt_thread, daemon=True)
        thread.start()

    def on_build(self, event):
        self.log("🔨 开始构建...")
        self.statusbar.SetStatusText("正在构建...")

        def build_thread():
            try:
                output, success = run_command("bun run build")
                for line in output.split('\n'):
                    if line.strip():
                        wx.CallAfter(self.log, line.strip())
                if success:
                    self.log("✅ 构建完成")
                    wx.CallAfter(self.statusbar.SetStatusText, "构建完成")

                    dist_dir = PROJECT_ROOT / 'dist'
                    if dist_dir.exists():
                        size = sum(f.stat().st_size for f in dist_dir.rglob('*') if f.is_file())
                        size_mb = size / (1024 * 1024)
                        self.log(f"📦 构建产物: {size_mb:.2f} MB")
                else:
                    self.log("❌ 构建失败")
            except Exception as e:
                self.log(f"❌ 异常: {e}")

        thread = threading.Thread(target=build_thread, daemon=True)
        thread.start()

    def on_deploy(self, event):
        dlg = wx.MessageDialog(self,
            "确认部署到GitHub Pages？\n\n将执行：\n"
            "1. 加密受保护文章\n"
            "2. 构建站点\n"
            "3. 提交并推送到GitHub",
            "确认部署", wx.YES_NO | wx.ICON_QUESTION)

        if dlg.ShowModal() == wx.ID_YES:
            self.log("🚀 开始部署...")
            self.statusbar.SetStatusText("正在部署...")

            def deploy_thread():
                try:
                    self.log("🔒 执行加密...")
                    run_command("bun run encrypt")

                    self.log("🔨 构建站点...")
                    output, success = run_command("bun run build")
                    for line in output.split('\n'):
                        if line.strip():
                            wx.CallAfter(self.log, line.strip())

                    if not success:
                        self.log("❌ 构建失败，取消部署")
                        return

                    self.log("📦 提交到Git...")
                    run_command('git add -A')
                    commit_msg = f"更新站点 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                    run_command(f'git commit -m "{commit_msg}"')

                    self.log("📤 推送到GitHub...")
                    output, success = run_command("git push origin main")
                    for line in output.split('\n'):
                        if line.strip():
                            wx.CallAfter(self.log, line.strip())

                    if success:
                        self.log("✅ 部署完成！等待GitHub Actions执行...")
                        wx.CallAfter(self.statusbar.SetStatusText, "部署完成")
                        wx.CallAfter(wx.MessageBox,
                            "✅ 部署完成！\n\n等待约1-2分钟后访问：\nhttps://atom1st.github.io",
                            "部署成功", wx.OK | wx.ICON_INFORMATION)
                    else:
                        self.log("❌ 部署失败")
                except Exception as e:
                    self.log(f"❌ 异常: {e}")

            thread = threading.Thread(target=deploy_thread, daemon=True)
            thread.start()
        dlg.Destroy()

    def on_console_clear(self, event):
        self.console.SetValue('')

    def on_about(self, event):
        about_text = """AI-new 网站维护工具 v1.0

基于 wxPython 构建的网站维护一体化工具

功能：
• 文章/资源管理 (可视化编辑)
• True/False 选项控制热门和加密
• 加密内容处理 (指定密码)
• 构建与部署 (一键部署到GitHub)
• 实时预览

使用说明：
• 新建/编辑文章时，热门和加密用下拉菜单选择
• 加密时需要输入密码
• 编辑后点击"保存"自动更新文件

项目: AI-new
作者: Guiyihan
"""
        wx.MessageBox(about_text, "关于", wx.OK | wx.ICON_INFORMATION)

    def on_close(self, event):
        self.Destroy()
        sys.exit(0)

# ==================== 应用程序类 ====================
class App(wx.App):
    def OnInit(self):
        self.SetAppName("AI-new网站维护工具")
        frame = MainFrame()
        frame.Show()
        return True

# ==================== 入口 ====================
def main():
    app = App()
    app.MainLoop()

if __name__ == '__main__':
    main()
