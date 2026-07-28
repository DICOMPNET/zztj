#!/usr/bin/env python3
"""人物提取 v2（精確率優先，純規則，可復現）。

兩遍法：
  1) 只從高置信語境提取"種子"候選：
     - 說話人錨點：句讀/引號後的「X曰」
     - 交互模式：「X謂Y曰」「X問於Y」「封X為Y」
     - 稱號模式：「是為/立為/尊為/號為 X王/侯/...」
     - 帝王世系：sections[].king（清洗 {{}}、（）、〔〕、年號綴、上/中/下綴）
  2) 用通過校驗的種子作為詞典，回數全文出現次數並記錄 refs。

輸出 data/parsed/persons_clean.json：
  {name: {"count": int, "titles": [...], "refs": [{"juan", "year", "label"}, ...]}}
"""
import glob, json, os, re
from collections import defaultdict

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "parsed")
MAX_REFS = 400
MIN_COUNT = 2          # 普通候選至少出現 2 次
HAN = r"\u4e00-\u9fff"

# ---------------------------------------------------------------- 文本清洗
def clean_text(t):
    """剝除校勘/夾注符號後的文本，避免〔〕()混入人名。"""
    t = re.sub(r"〔[^〕]*〕", "", t)
    t = re.sub(r"（[^）]*）", "", t)
    t = re.sub(r"\{\{[^}]*\}\}", "", t)
    return t

# ---------------------------------------------------------------- 提取模式
# 說話人：錨定句讀/引號/行首之後的「X曰」
PAT_SPEAK = re.compile(r"(?:^|[。！？；：，、\n「『」』])([" + HAN + r"]{1,6})曰")
# X謂Y曰（雙方皆候選）
PAT_WEI = re.compile(r"([" + HAN + r"]{1,4})謂([" + HAN + r"]{1,6})曰")
# X問於Y（雙方皆候選）
PAT_WEN = re.compile(r"([" + HAN + r"]{1,4})問於([" + HAN + r"]{1,4})")
# 封X為Y（X 為人名，Y 為爵號）
PAT_FENG = re.compile(r"封([" + HAN + r"]{1,3}?)為([" + HAN + r"]{1,3}?"
                      r"(?:侯|君|公|王|伯|子|男))")
# 是為/立為/尊為/號為 + 稱號
PAT_THRONE = re.compile(r"(?:是為|立為|尊為|號為|號曰)([" + HAN + r"]{1,4}?"
                        r"(?:皇帝|王|帝|侯|公|伯|子|男|君))")

# 稱號後綴（只用封爵/尊號；將軍、丞相等官名不作稱號，避免官名混入）
TITLE_SUFFIXES = ("太皇太后", "太皇太後", "皇帝", "天王", "太后", "皇后",
                  "太子", "太孫", "公主", "夫人", "王", "帝", "公", "侯",
                  "伯", "子", "男", "君")

# 單字國名：單國名+王/帝/公/侯（楚王、秦王…）指當時君主，歧義大，排除
STATES = set("秦楚齊燕韓趙魏漢晉宋衛鄭吳越周魯梁陳蔡曹薛代蜀唐虞夏商杞")

# 泛稱稱號，整體排除
GENERIC_TITLES = set("""
王 帝 公 侯 伯 子 男 君 皇帝 天子 天王 太上皇 太后 太皇太后 皇太后 皇后
太子 皇太子 太孫 公主 夫人 王后 王太后 王妃 皇子 皇孫 皇太子妃
諸侯 王侯 列侯 關內侯 徹侯 通侯 郡王 親王 國王 藩王 霸王 帝王
王公 君王 大王 人主 主上 嗣君 人君 明王 聖王 賢王 先王 後王 小王 君王后
世子 國主 家主 女主 少主 幼主 新主 故主 舊主 長公主 大長公主 郡主
縣主 鄉主 翁主 王姬 帝姬 皇女 王女 貴主 長主 大主 太主 主公 主君
可汗 單于 贊普 可敦 俟斤 葉護 特勤 天可汗 大可汗 小可汗 副可汗
太妃 貴妃 淑妃 德妃 賢妃 惠妃 麗妃 華妃 貴嬪 昭容 昭媛 修儀 修容
修媛 充儀 充容 充媛 寶林 御女 更衣 充衣 良娣 容華 充依
""".split())

# 官名前綴：說話人以官銜開頭時剝除（丞相亮→亮、太尉楊彪→楊彪）
OFFICE_PREFIXES = tuple(sorted({
    "大將軍", "驃騎將軍", "車騎將軍", "衛將軍", "前將軍", "後將軍",
    "左將軍", "右將軍", "征東將軍", "征西將軍", "征南將軍", "征北將軍",
    "鎮東將軍", "鎮西將軍", "鎮南將軍", "鎮北將軍", "安東將軍", "安西將軍",
    "安南將軍", "安北將軍", "平東將軍", "平西將軍", "平南將軍", "平北將軍",
    "將軍", "丞相", "相國", "太尉", "御史大夫", "御史中丞", "大司馬",
    "大司空", "大司徒", "司空", "司徒", "太傅", "太保", "太師", "少傅",
    "少師", "尚書令", "尚書僕射", "尚書", "中書令", "中書監", "侍中",
    "黃門侍郎", "散騎常侍", "中常侍", "給事中", "廷尉", "太僕", "宗正",
    "少府", "太常", "光祿勳", "光祿大夫", "太中大夫", "中大夫", "諫大夫",
    "諫議大夫", "衛尉", "執金吾", "中尉", "內史", "大鴻臚", "大農令",
    "大司農", "水衡都尉", "將作大匠", "詹事", "大長秋", "太子太傅",
    "太子少傅", "司隸校尉", "司隸", "刺史", "州牧", "太守", "郡守",
    "縣令", "長史", "中郎將", "校尉", "都尉", "中郎", "郎中", "侍郎",
    "議郎", "博士", "謁者", "中護軍", "中領軍", "護軍", "領軍", "主簿",
    "參軍", "從事", "別駕", "治中", "功曹", "督郵", "五官掾",
}, key=len, reverse=True))

# 官名後綴：以這些結尾的候選視為官名而非人名（大將軍、左將軍、長史…）
OFFICE_SUFFIXES = ("將軍", "中郎將", "校尉", "都尉", "長史", "司馬", "司空",
                   "司徒", "丞相", "相國", "太尉", "太傅", "太保", "太師",
                   "少傅", "少師", "少保", "尚書", "侍中", "侍郎", "郎中",
                   "太守", "刺史", "州牧", "郡守", "縣令", "令尹", "大夫",
                   "博士", "主簿", "參軍", "司隸", "廷尉", "宗正", "大鴻臚",
                   "光祿勳", "衛尉", "太僕", "常侍", "黃門", "御史", "謁者",
                   "中尉", "內史", "少府", "執金吾", "水衡都尉", "詹事",
                   # 唐五代官制：凡「X使」皆官（節度/觀察/鹽鐵/樞密/宣徽…）
                   "使", "判官", "推官", "巡官", "掌書記", "書記", "孔目官",
                   "押牙", "牙將", "都頭", "虞候", "鈐轄", "部署", "留後",
                   "通判", "知州", "知府", "知縣", "府尹", "少尹", "縣尉",
                   "縣丞", "同知", "僉事", "都事", "經歷", "祭酒", "司業",
                   "助教", "洗馬", "中允", "贊善", "統軍", "都統", "統制",
                   "統領", "總管", "元帥", "點檢", "都監", "監押", "巡檢",
                   "承旨", "待制", "待詔", "拾遺", "補闕", "司諫", "正言",
                   "校書", "正字", "員外郎", "供奉", "殿直", "內侍", "監軍",
                   "太常", "太史令", "司天監", "典籤", "錄事", "令史")

# 說話人候選開頭的言語/動作動詞，剝除
LEAD_VERBS = ("對曰", "答曰", "對", "答", "請", "諫", "問", "告", "語", "謂",
              "説", "說", "言", "呼", "罵", "歎", "嘆", "笑", "哭", "謝",
              "賀", "諷", "譏", "奏", "啟", "白", "見", "令", "使", "遣",
              "召", "或", "客", "人", "眾", "頓首", "再拜", "稽首", "避席",
              "上書", "上言", "乃", "遂", "故", "且", "又", "亦", "皆",
              "各", "自", "相", "與", "因", "即", "輒", "乃", "復", "更",
              "謀", "議", "論", "尊", "立", "廢", "奉", "擁", "拜", "封")
# 說話人候選結尾的動作動詞，剝除（如「絺疵入曰」「樊崇等曰」）
TAIL_VERBS = ("上疏", "上書", "上言", "上表", "封事", "入", "出", "問", "答",
              "笑", "怒", "喜", "泣", "歎", "嘆", "拜", "起", "走", "坐",
              "對", "書", "贊", "讚", "論", "評", "繫", "言", "報", "召",
              "見", "聞", "數", "責", "讓", "謝", "賀", "哭", "顧", "曰",
              "辭", "請", "諫", "白", "奏", "等", "因", "詔", "謀", "稱",
              "議", "驚", "懼", "恐", "憂", "跽", "計", "獨", "復", "應")

# 人名首字/尾字禁用（虛詞、類名用字）
LEAD_BAD = set("之乎者也矣焉哉耳曰云且夫蓋凡今昔初及至於于以為與或乃則"
               "遂故然若雖苟誠既又亦皆各互相對問答謂語言諫使令遣召見聞"
               "知欲將可能當未嘗莫勿毋非無不有在何誰孰安惡焉胡奚盍曷而其"
               "族賜鄙")
TAIL_BAD = set("之乎者也矣焉哉耳曰云謂語對問答諫及與以于於而乃則遂故然"
               "且若雖蓋凡昔初夫及至從為使令將相卿士大夫民人眾臣妾奴士"
               "卒兵馬車船宮室朝廷國家年歲時月日邑郡縣鄉里州敵賊勝敗禍"
               "福吉凶賞罰誅殺生死出入內外上下中左右南北東西宮闕門戶道"
               "路金帛穀粟米鹽鐵酒肉衣冠弓矢劍戟甲首級首虜斬獲皆主"
               "大頭手呼指又或妻母弟列城莫")
# 人名中不應出現的字（數字、自然物、虛詞）
NEVER_CHARS = set("一二三四五六七八九十百千萬億兩"
                  "天地日月星辰風雲雷雨山川江河水火木金土石"
                  "乎者也矣焉哉耳之")

# 多字黑名單：虛詞組合、官名、泛稱、國族名、地名等（逐輪人工審核補充）
BLACKLIST = set("""
臣光 臣等 臣聞 二子 二王 三王 五伯 三公子 國人 野人 左右 群臣 諸君 君子
小人 夫子 公子 王子 王孫 天子 天下 大王 人主 主上 陛下 足下 寡人 不穀
將軍 丞相 相國 太尉 御史 御史大夫 尚書 尚書令 中書令 侍中 黃門 常侍
侍郎 郎中 中郎將 博士 大夫 令尹 太守 刺史 州牧 郡守 縣令 都督 司馬
司徒 司空 太傅 太保 太師 少師 少傅 宗正 廷尉 大鴻臚 光祿勳 衛尉 太僕
諸侯 列侯 宗室 外戚 宦官 使者 從者 舍人 門客 賓客 食客 說客 刺客 行人
大人 賢者 聖人 賢人 仁者 勇者 壯士 力士 眾人 故人 丈人 長者 少年 兒子
父子 兄弟 母子 君臣 夫婦 子弟 子孫 先人 後人 家人 婦人 女子 男子 男兒
老翁 老母 妾婦 奴婢 賊人 敵人 百姓 人民 萬民 百官 有司 上書 有以 可以
所以 於是 至於 然而 然則 雖然 是故 是以 今夫 且夫 若夫 夫惟 蓋聞 竊聞
臣聞 愚聞 鄙人 不肖 不穀 孤家 借使 假令 設令 譬如 譬若 凡此 如此 若此
匈奴 單于 可汗 閼氏 南越 東越 閩越 月氏 大宛 烏孫 樓蘭 朝鮮 夜郎 西域 百越
東胡 西戎 北狄 南蠻 諸夏 中國 四夷 蠻夷 戎狄 胡虜 鮮卑 羌胡 氐羌
更始 貳師 大驚 叩頭 流涕 良久 頓首 再拜 稽首 避席 上疏 上表 奏事
軍吏 軍士 士卒 吏民 吏卒 兵吏 將士 將吏 諸將 諸公 諸生 諸子 儒生
游俠 門下 帳下 麾下 部下 部曲 從事 掾史 掾屬 軍正 軍候 候吏
大行 父老 昆莫 神君 元君 漂母 中流 名姓 陰謀 太息 徒屬 舉手 武王伐紂
宗族 先驅 後隊 前鋒 偏師 大軍 大兵 精兵 精騎 騎兵 步兵 車騎 驃騎
主人翁 長男 長女 邑君 國房君 右翊公 趙相周昌 貴人姑翼 南越王佗
# 民族/部族/政權名（非人名）
契丹 突厥 吐蕃 回紇 回鶻 吐谷渾 南詔 高麗 高句麗 百濟 新羅 日本 倭國
大食 波斯 天竺 拂菻 党項 黨項 沙陀 靺鞨 室韋 韃靼 女真 烏桓 康居
安息 條支 身毒 罽賓 疏勒 于闐 龜茲 焉耆 車師 鄯善 精絕 且末 小宛
阿史那 阿史德 僕骨 契苾 同羅 拔野古 思結 斛薛 奚結 白霫 葛邏祿
拔悉密 突騎施 黠戛斯 骨利幹 都播 駁馬 流鬼 骨咄 奚契丹 奚 霫
胡人 蕃人 蠻人 越人 夷人 狄人 羌人 羯人 蕃將 蕃兵 胡兵 胡騎 胡虜
蕃虜 蠻夷 夷狄 戎狄 北虜 四夷 諸蕃 諸胡 諸蠻 諸羌 諸戎 群胡 群虜
群蠻 胡商 胡客 蕃客 蕃商 賈胡 商胡
# 地名/區域名（非人名）
長安 京師 京城 京都 京邑 京洛 洛陽 洛邑 洛京 東都 西都 北京 南京
上都 陪都 行在 行宮 京畿 都畿 畿內 畿甸 咸陽 鄴城 鄴都 鄴宮 鄴下
建康 建鄴 金陵 江寧 白下 石頭 江陵 成都 益州 蜀都 錦城 晉陽 太原
并州 幽州 范陽 薊城 薊門 燕京 燕都 盧龍 平盧 河東 河西 隴右 隴西
劍南 嶺南 淮南 淮北 河南 河北 河內 河外 河朔 河湟 江淮 江表 江東
江西 江南 江北 江夏 江州 九江 潯陽 柴桑 豫章 鄱陽 廬陵 臨川 南康
會稽 吳郡 吳興 丹陽 丹楊 宣城 壽春 壽陽 合肥 廬江 濡須 關中 關東
關西 關內 關外 函谷 潼關 崤函 滎陽 滎澤 成皋 虎牢 汜水 鞏洛 偃師
孟津 陜州 陝州 弘農 華陰 華州 馮翊 扶風 武功 郿塢 郿縣 陳倉 散關
大散關 褒斜 子午 駱谷 儻駱 斜谷 祁山 街亭 上邽 冀城 天水 隴城
安定 北地 雍城 櫟陽 涇陽 雲陽 池陽 高陵 萬年 杜陵 霸陵 霸上 灞上
新豐 鴻門 戲下 藍田 商於 商州 商洛 武關 峣關 大梁 浚儀 汴州 汴京
汴梁 東京 開封 陳留 宋州 睢陽 宋城 歸德 許昌 許都 許下 潁川 潁陰
鄢陵 扶溝 尉氏 中牟 圃田 官渡 烏巢 白馬 延津 黎陽 朝歌 汲郡 懷州
溫縣 軹縣 濟源 王屋 河陽 河橋 中原 中州 中土 中華 華夏 諸夏 赤縣
神州 四海 八荒 六合 九州 九土 九域 九有 禹跡 海內 域中 區夏 方夏
中夏 函夏 諸華 山東 山西 山前 山後 塞北 塞外 塞內 漠北 漠南 西域
西陲 西鄙 東鄙 南鄙 北鄙 邊鄙 邊陲 邊垂 邊庭 疆場 疆埸 封疆 藩籬
# 官署/官稱泛稱
太常 大理 宗正 光祿 衛尉 太僕 鴻臚 司農 少府 將作 國子 司天 樞密
監軍 中使 中貴 中官
# 親屬/身份泛稱
妻子 妻孥 妻小 妻兒 家屬 家口 老小 幼累 孥累 嫡子 庶子 嗣子 養子
繼子 愛子 少子 小子 稚子 嬰子 逆子 賊子 孽子 宗子 世子 長子 次子
腹心 心腹 爪牙 耳目 股肱 喉舌 臂指 羽翼 黨羽 黨與 朋黨 親黨 所部
所親 所善 所愛 所寵 所幸 所惡 所居 親信 親近 近習 侍側 側近 近侍
近臣 寵臣 寵妾 寵姬 嬖臣 嬖人 倖臣 倖人 佞臣 弄臣 權臣 奸臣 姦臣
賊臣 逆臣 叛臣 降臣 降將 叛將 敗將 逃將 亡將 諸軍 諸道 諸鎮 諸州
諸郡 諸縣 諸國 諸王 諸卿 諸臣 諸吏 諸部 諸落 僚佐 僚屬 幕僚 幕府
幕下 賓佐 賓從 佐吏 佐貳 官屬 執政 虎賁 羽林 期門 佽飛
# 複姓單獨出現（氏族名，非具體人物）
斛律 慕容 拓跋 宇文 爾朱 賀蘭 獨孤 長孫 尉遲 呼延 乞伏 禿髮 沮渠
赫連 万俟 哥舒 鮮于 公孫 司馬氏 諸葛 夏侯 皇甫 令狐 聞人 申屠 司徒氏
# 動詞/普通名詞殘片
從容 處分 姓名 長樂 京口 廣陵 彭城 下邳 姑孰 歷陽 采石 臺城 新亭
鍾山 朱雀 秦淮 乘間 切齒 築壘 倉猝 南向 兵法 仁義
# 匈奴官號（泛指其官，非人名）
左賢王 右賢王 谷蠡王 左谷蠡王 右谷蠡王 左大將 右大將 左大當戶
右大當戶 大當戶 當戶 且渠 左骨都侯 右骨都侯 骨都侯
# 事件/動詞殘片
改元 大赦 即位 登基 踐阼 受禪 禪位 冊立 冊封 冊拜 拜官 授官 除官
遷官 左遷 貶官 罷官 免官 削爵 進爵 加爵 賜爵 行賞 罰罪 治罪 伏誅
伏法 棄市 腰斬 車裂 族誅 夷族 滅族 籍沒 流徙 駕崩 晏駕 上賓 大漸
臨朝 稱制 垂簾 聽政 親政 歸政 還政 輔政 攝政 顧命 託孤 上疏 上表
上章 上奏 封事 密奏 密疏 下詔 頒詔 降詔 手詔 中詔 制詔 進軍 進兵
進擊 進攻 出軍 出兵 出擊 出戰 征討 征伐 討伐 討擊 攻擊 攻城 攻取
攻克 攻陷 陷落 陷沒 失守 陷敗 破敗 擊破 擊敗 擊走 擊退 大破 大敗
大勝 全勝 凱旋 獻捷 獻俘 告捷 奏捷 露布 露版 軍報 捷報
婕妤 昭儀 美人 良人 貴人 才人 采女 宮人 黃門令 中黃門 小黃門
春秋 詩書 周易 尚書 禮記 論語 孝經 爾雅 史記 漢書 老子 道德 太上 無為
陰陽 五行 天文 地理 河圖 洛書 神明 鬼神 天地 社稷 宗廟 朝廷 國家 宮室
祖宗 先帝 先王 先公 先君 列祖 高祖 曾祖 祖父 父母 伯叔 舅姑 姑舅 姊妹
嫂叔 婦姑 兒女 妻妾 妃嬪 嬪妃 后妃 嬪御 姬妾 媵妾 側室 嫡庶 長幼 尊卑
貴賤 親疏 遠近 內外 左右 前後 上下 本末 終始 古今 夙夜 朝夕 旦暮 日夜
""".split())

# 白名單：被字規則誤傷的真人名（逐輪補充）
WHITELIST = set("""
""".split())

# 帝王 heading 中需要跳過的（非人物）
KING_SKIP = set("校記 校改記 附錄 附記 考異 目錄 凡例".split())

def strip_office_prefix(name):
    """剝除官銜前綴；餘下 2-4 字視為人名。若官銜後只剩單字/超長，
    返回空串（整體丟棄，如「丞相亮」「大將軍青」）。"""
    for off in OFFICE_PREFIXES:
        if name.startswith(off) and len(name) > len(off):
            rest = name[len(off):]
            return rest if 2 <= len(rest) <= 4 else ""
    return name

def strip_verbs(name, leading=True, trailing=True):
    """剝除候選前綴言語動詞/後綴動作動詞（可重複剝）。"""
    changed = True
    while changed and name:
        changed = False
        if leading:
            for v in LEAD_VERBS:
                if name.startswith(v) and len(name) > len(v):
                    name = name[len(v):]
                    changed = True
                    break
        if trailing:
            for v in TAIL_VERBS:
                if name.endswith(v) and len(name) > len(v):
                    name = name[:-len(v)]
                    changed = True
                    break
    return name

def split_title(name):
    """把「前綴+稱號」拆開；非稱號結構返回 None。"""
    for suf in TITLE_SUFFIXES:
        if name.endswith(suf) and len(name) > len(suf):
            return name[:-len(suf)], suf
    return None

def valid_plain(name):
    """普通人名校驗（不帶稱號）。"""
    if name in WHITELIST:
        return True
    if not (2 <= len(name) <= 4):
        return False
    if name in BLACKLIST or name in GENERIC_TITLES:
        return False
    if split_title(name):            # 帶稱號的走 valid_titled
        return False
    if name[0] in LEAD_BAD or name[-1] in TAIL_BAD:
        return False
    if any(c in NEVER_CHARS for c in name):
        return False
    return True

def valid_titled(name):
    """帶稱號人名校驗（智伯、魏文侯、秦昭王、武帝…）。"""
    if name in WHITELIST:
        return True
    if name in BLACKLIST or name in GENERIC_TITLES:
        return False
    sp = split_title(name)
    if not sp:
        return False
    pre, suf = sp
    if not (1 <= len(pre) <= 3):
        return False
    # 單國名 + 王/帝/公/侯/皇帝：當時君主，歧義，排除
    if len(pre) == 1 and pre in STATES and suf in ("王", "帝", "皇帝", "公", "侯"):
        return False
    # 單國名 + 太子/太后/皇后/公主等泛稱，同樣歧義
    if len(pre) == 1 and pre in STATES and suf in ("太子", "太后", "皇后",
                                                   "公主", "夫人", "太孫"):
        return False
    if pre in BLACKLIST or pre in GENERIC_TITLES:
        return False
    if any(c in NEVER_CHARS for c in pre):
        return False
    if pre[0] in LEAD_BAD:
        return False
    return True

def valid(name):
    if not name:
        return False
    if name in WHITELIST:
        return True
    if name.endswith("閼氏"):            # 匈奴后稱號，非人名
        return False
    if name.endswith("氏"):              # 王氏、司馬氏…姓氏+氏，非具體人名
        return False
    if name[0] in "帝后":                # 帝復、后X 之類殘片
        return False
    if name.startswith("上") and not name.startswith("上官"):
        return False                     # 上復、上輒、上封事…（上官為複姓）
    if name.startswith("皇") and not name.startswith("皇甫"):
        return False                     # 皇太后、皇太子…（皇甫為複姓）
    if any(name.endswith(s) for s in OFFICE_SUFFIXES):
        return False
    if split_title(name):
        return valid_titled(name)
    return valid_plain(name)

def add(cands, name, allow_titled=True):
    """清洗並校驗後加入候選集合。"""
    if "謂" in name:                     # 「X謂Y曰」整段被捕獲時只取 Y
        name = name.rsplit("謂", 1)[-1]
    name = strip_office_prefix(strip_verbs(name))
    if not name:
        return
    if valid(name):
        cands.add(name)

def extract_seeds(text):
    """從單段文本提取高置信種子。"""
    cands = set()
    for m in PAT_SPEAK.finditer(text):
        add(cands, m.group(1))
    for m in PAT_WEI.finditer(text):
        x = strip_office_prefix(strip_verbs(m.group(1)))
        y = strip_office_prefix(strip_verbs(m.group(2), leading=False))
        if valid(x):
            cands.add(x)
        if valid(y):
            cands.add(y)
    for m in PAT_WEN.finditer(text):
        x = strip_office_prefix(strip_verbs(m.group(1)))
        y = strip_office_prefix(strip_verbs(m.group(2), leading=False))
        if valid(x):
            cands.add(x)
        if valid(y):
            cands.add(y)
    for m in PAT_FENG.finditer(text):
        x = strip_office_prefix(m.group(1))
        if x and valid_plain(x):
            cands.add(x)
        if valid_titled(m.group(2)):
            cands.add(m.group(2))
    for m in PAT_THRONE.finditer(text):
        if valid_titled(m.group(1)):
            cands.add(m.group(1))
    return cands

def clean_king(raw):
    """清洗 sections[].king，返回帝王稱號或 None。"""
    k = re.sub(r"\{\{[^}]*\}\}", "", raw)
    k = re.sub(r"（[^）]*）", "", k)
    k = re.sub(r"〔[^〕]*〕", "", k)
    k = re.sub(r"(?:元|[一二三四五六七八九十百千]+)年.*$", "", k)
    for suf in ("上之上", "上之下", "中之上", "中之下", "下之上", "下之下",
                "上下", "上", "中", "下"):
        if k.endswith(suf) and len(k) > len(suf):
            k = k[:-len(suf)]
            break
    k = k.strip()
    if not k or k in KING_SKIP or "校" in k or "記" in k:
        return None
    # 只保留到第一個尊號字（皇帝/皇后/帝/王/后），去掉年號殘留（如
    # 「世祖文皇帝黃初」→「世祖文皇帝」）；沒有尊號字的（純年號）跳過
    m = re.search(r"(太皇太后|皇帝|皇后|太后|帝|王|后)", k)
    if not m:
        return None
    k = k[:m.end()]
    if len(k) < 2 or len(k) > 8:
        return None
    return k

def main():
    files = sorted(glob.glob(os.path.join(OUT, "juan", "*.json")))
    docs = []            # [(juan, year, label, text)] 按卷順序
    kings = defaultdict(list)   # king -> [(juan, raw_heading)]
    for f in files:
        j = json.load(open(f, encoding="utf-8"))
        for s in j["sections"]:
            king = clean_king(s.get("king", ""))
            if king:
                kings[king].append((j["juan"], s["king"]))
            for y in s["years"]:
                for b in y["blocks"]:
                    docs.append((j["juan"], y.get("year"), y.get("label", ""),
                                 clean_text(b["text"])))

    # 第一遍：種子提取
    seeds = set()
    for _, _, _, text in docs:
        seeds |= extract_seeds(text)
    seeds = {s for s in seeds if valid(s)}

    # 第二遍：詞典回數
    persons = {}
    for name in sorted(seeds, key=len, reverse=True):
        persons[name] = {"count": 0, "titles": set(), "refs": []}
    for name in kings:
        persons.setdefault(name, {"count": 0, "titles": set(), "refs": []})
        persons[name]["titles"].add("帝王")

    # 短鍵是長鍵子串時（李克⊂李克用、康子⊂韓康子），短鍵出現在長鍵內的
    # 次數要扣除，避免重複計數/錯誤 refs
    longer = {k: [l for l in persons if len(l) > len(k) and k in l]
              for k in persons}
    longer = {k: v for k, v in longer.items() if v}

    for juan, year, label, text in docs:
        for name, p in persons.items():
            n = text.count(name)
            if n:
                for l in longer.get(name, ()):
                    n -= text.count(l)
                if n <= 0:
                    continue
                p["count"] += n
                if len(p["refs"]) < MAX_REFS:
                    p["refs"].append({"juan": juan, "year": year, "label": label})
    # 帝王 heading 本身計一次（refs 以原文 heading 為 label）
    for king, occ in kings.items():
        p = persons[king]
        for juan, raw in occ:
            p["count"] += 1
            if len(p["refs"]) < MAX_REFS:
                p["refs"].append({"juan": juan, "year": None, "label": raw})

    out = {}
    for name, p in persons.items():
        titled = bool(split_title(name))
        titles = sorted(p["titles"] | ({"爵稱"} if titled else set()))
        if p["count"] >= MIN_COUNT or "帝王" in titles:
            out[name] = {"count": p["count"], "titles": titles, "refs": p["refs"]}
    out = dict(sorted(out.items(), key=lambda kv: -kv[1]["count"]))
    with open(os.path.join(OUT, "persons_clean.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False)
    print(f"seeds: {len(seeds)}, kings: {len(kings)}, output: {len(out)}")
    for k in list(out)[:80]:
        print(f"  {k}: {out[k]['count']} {out[k]['titles']}")

if __name__ == "__main__":
    main()
