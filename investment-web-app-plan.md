# 台美股投資決策系統專案計畫

## 0. Executive Summary

本專案是一個私人的家庭投資決策輔助系統，用來管理台股、美股與 ETF 投資。系統使用繁體中文介面，支援不同家庭成員各自建立投資組合、關注清單、Mission 任務與每日分析報告。

Stage 1 先建立單一 AI division：GPT Division。Division manager 是 Monica，使用 GPT 5.5 作為 brain。Monica 管理五組分析團隊：基本面品質、技術量價、總經產業、事件催化、風險控管。每組團隊每天會檢查市場、分析使用者投資組合、處理使用者指定 Mission，並掃描市場推薦 3 檔股票或 ETF。Monica 整合五組團隊報告後，提出最終投資建議。

系統會追蹤每組 team、Monica、以及每筆 recommendation 的後續表現，計算 accuracy rate 與 influence points。未來可擴充 Claude Division 與 Gemini Division，形成多模型投資委員會；只有多個 division 形成共識時，才產生更強的 action call。

第一版目標不是公開產品，也不是自動交易系統，而是家庭內部使用的投資研究與決策工作台。

## 0.1 Stage 1 架構圖

```text
Family Users
    |
    v
Portfolio / Watchlist / Mission Center
    |
    v
Daily Data Package / Mission Package
    |
    v
GPT Division
    |
    +-- 基本面品質團隊
    +-- 技術量價團隊
    +-- 總經產業團隊
    +-- 事件催化團隊
    +-- 風險控管團隊
    |
    v
Monica - GPT 5.5 Division Manager
    |
    v
Final Decision / Recommendations / Performance Tracking
```

## 0.2 Build Roadmap

Milestone 1：Foundation

- 建立 Next.js 專案
- 建立 Supabase schema
- 建立 private family user model
- 建立繁體中文 app shell
- 建立 portfolio 與 watchlist CRUD

Milestone 2：Market Data

- 串接 Finnhub
- 串接 Alpha Vantage backup
- 串接 TWSE / TPEx official data
- 串接 Frankfurter FX
- 串接 FRED macro data
- 建立 manual refresh 與 timer refresh

Milestone 3：Mission 與 Monica

- 建立 Mission Center
- 建立五組 team report pipeline
- 建立 Monica final decision pipeline
- 建立 JSON validation 與 audit trail
- 儲存 recommendations

Milestone 4：Performance

- 建立 recommendation outcome tracking
- 建立 influence points 初版
- 建立 Performance Dashboard
- 建立 paper trading records

Milestone 5：Polish

- 完成 professional financial dashboard UI
- 加入 charts
- 加入 alerts
- 完成 desktop / mobile visual QA
- 完成 Stage 1 acceptance criteria

## 0.3 Current Decisions

- 使用情境：家庭私用，不公開。
- 使用者：可有多位家庭成員。
- Stage 1：只有 GPT Division。
- Division manager：Monica。
- Brain：GPT 5.5。
- 市場：台股、美股、ETF。
- Portfolio：手動輸入。
- 資料來源：公開資料，非 GPT API 必須免費。
- 台股資料：TWSE / TPEx / government open data。
- 美股資料：Finnhub primary，Alpha Vantage backup。
- FX：Frankfurter。
- Macro：FRED。
- Refresh：manual refresh + timer refresh。
- UI：Next.js、TypeScript、Tailwind CSS、shadcn/ui、lucide-react、Recharts、Lightweight Charts。
- Database：Supabase Postgres。

## 0.4 Open Decisions

- 家庭成員是否可以互相查看 portfolio。
- 是否需要 family admin 角色。
- 是否需要共享 watchlist。
- 是否需要共享 Monica reports。
- 是否要允許某位家庭成員替其他成員建立 Mission。
- 是否需要每位家庭成員有不同風險設定。
- 是否需要家庭總覽 dashboard。

## 1. 專案目標

建立一個家庭私用的繁體中文網頁系統，用來管理台股與美股投資流程。系統會支援多位家庭成員，各自擁有投資組合、關注清單、Mission 任務、台美市場指數摘要、每日五組分析團隊報告，以及 Monica 最終投資決策。

本系統定位為「投資決策輔助工具」，不是保證獲利或取代專業投資顧問的工具。

## 2. 已確認需求

- 使用者：家庭私用，可支援多位家庭成員
- 公開範圍：不公開，不做 public SaaS
- 語言：繁體中文，偏台灣使用情境
- 投資市場：台股、美股、ETF
- 投資組合輸入方式：手動輸入
- 資料來源：只使用公開資料
- API 成本限制：除了 GPT / OpenAI API 以外，其餘 API 必須免費
- 即時資料：希望支援，但需依免費資料源實際限制調整
- 券商串接：第一版不串接券商
- 分析產出：每日產生五組分析團隊建議，再由 CIO 整合決策

## 3. 核心功能

### 3.0 Family User Management 家庭使用者管理

系統是家庭私用，不公開給外部使用者。

需要支援：

- 多位家庭成員登入
- 每位家庭成員有自己的 portfolio
- 每位家庭成員有自己的 watchlist
- 每位家庭成員有自己的 Mission
- 每位家庭成員有自己的風險設定
- 每位家庭成員有自己的 Monica analysis history

可選共享功能：

- Family shared watchlist
- Family shared market notes
- Family shared Monica report
- Family overview dashboard

建議角色：

- family_admin：管理家庭成員、共用設定與資料可見權限
- family_member：管理自己的 portfolio、watchlist、missions

資料可見性初版建議：

- 每位 family_member 預設只能看自己的 portfolio。
- family_admin 可以選擇是否查看所有家庭成員資料。
- shared watchlist 與 shared reports 需要明確標記為 shared。
- 不做 public user discovery。
- 不做外部分享連結。

### 3.1 總覽 Dashboard

顯示整體投資狀態與今日重點。

- 投資組合總市值
- 今日損益
- 未實現損益
- 台幣與美元資產分布
- 台股與美股配置比例
- 風險集中度提醒
- 今日 CIO 結論摘要

### 3.2 我的投資組合

使用者手動建立與維護持股。

欄位：

- 市場：台股 / 美股
- 股票代號
- 股票名稱
- 類型：股票 / ETF
- 持有股數
- 平均成本
- 幣別：TWD / USD
- 投資策略：長期 / 波段 / 短線 / 觀察
- 個人備註

系統計算：

- 現價
- 市值
- 未實現損益
- 報酬率
- 投資組合占比
- 匯率換算後總價值

### 3.3 關注清單

使用者建立感興趣的股票或 ETF。

欄位：

- 市場
- 股票代號
- 股票名稱
- 關注原因
- 目標買進價
- 警示價格
- 狀態：觀察中 / 候選 / 暫不考慮
- 個人備註

### 3.4 市場指數摘要

顯示台股與美股主要市場狀態。

台股：

- 加權指數
- 櫃買指數
- 台幣匯率
- 台股市場趨勢摘要

美股：

- S&P 500
- Nasdaq
- Dow Jones
- 美債殖利率，如免費資料可取得
- 美股市場趨勢摘要

### 3.5 每日分析

每日由五組分析團隊針對同一批資料進行分析。

分析範圍：

- 我的投資組合
- 我的關注清單
- 台股市場
- 美股市場
- 公開新聞與基本面資料

每組分析團隊輸出：

- 投資組合分析
- 關注清單分析
- 推薦 3 檔可投資標的
- 建議買進點
- 建議賣出點
- 停損點
- 信心分數
- 主要風險
- 什麼情況會改變判斷

### 3.6 CIO 決策中心

CIO 角色會閱讀五組分析團隊的結果，整合成最終建議。

輸出內容：

- 今日總體投資判斷
- 最終推薦 3 檔標的
- 買進 / 持有 / 賣出 / 觀望建議
- 建議部位大小
- 建議買進點
- 停損點
- 停利點
- 信心分數
- 風險等級
- 接受或否決各分析團隊意見的理由

### 3.7 歷史報告

保留每日分析與 CIO 決策紀錄。

- 依日期查詢
- 依股票代號查詢
- 比較過去建議與後續價格表現
- 檢視 CIO 決策紀錄

### 3.8 Mission Center 任務中心

除了每日固定分析，系統也需要支援使用者指定任務。

每日固定分析是自動流程；任務中心是使用者主動提出問題，讓五組分析團隊針對同一個任務進行分析，再交給 CIO 做最終決策。

使用者可以輸入：

- Analyze Nvidia
- Should I buy TSMC now?
- Compare NVDA, AMD, and TSMC
- Review my AI exposure
- Find the best 3 stocks from my watchlist this week

任務類型：

- 單一股票任務：分析 Nvidia、TSMC、Apple 等單一標的
- 多股票比較任務：比較 NVDA、AMD、TSMC
- 投資組合任務：檢查是否過度集中在 AI、半導體、美股或台股
- 關注清單任務：從關注清單挑出最值得追蹤或投資的標的
- 主題任務：分析 AI infrastructure、台灣半導體供應鏈、金融股等主題
- 事件任務：財報前後、Fed 決策後、重大新聞後的投資判斷

每個任務需要儲存：

- 任務標題
- 任務類型
- 相關股票代號
- 相關市場
- 使用者原始問題
- 建立日期
- 狀態：pending / running / completed / cancelled
- 五組團隊報告
- CIO 最終決策
- 後續追蹤提醒
- 7 日、30 日、90 日後結果追蹤

任務中心的價值：

- 可以保留每次投資問題的完整推理紀錄
- 可以追蹤 CIO 建議後續是否有效
- 可以回顧過去對同一股票的看法如何改變
- 可以讓使用者不只看每日報告，也能主動提出投資問題

### 3.9 Performance Dashboard 績效儀表板

系統需要每天追蹤每組團隊、每個 division、以及最終委員會的準確率與績效。

目的：

- 不讓所有團隊永遠擁有相同權重
- 追蹤哪些團隊的判斷比較準確
- 追蹤哪些 division 的整體決策品質較高
- 讓高準確率的團隊與 division 取得較高 influence points
- 讓未來分析可以參考過去績效，但不讓 influence points 直接取代共識規則

核心原則：

```text
Consensus decides whether action is allowed.
Influence points decide how strong the action is.
```

也就是：

- 三個 division 沒有共識時，即使某個 division influence points 很高，也不直接採取新行動。
- 三個 division 有共識時，influence points 會影響最終信心分數與建議部位大小。
- 高 influence division 的不同意見可以讓標的進入高優先觀察，但不能單獨觸發交易。

Performance Dashboard 主要區塊：

1. Team Performance
2. Division Performance
3. Final Committee Performance
4. Influence Points
5. Call History
6. Performance Charts

## 4. 五組分析團隊設計

系統第一階段先從單一 GPT Division 開始，未來再擴充成多模型投資委員會。

第一階段：

- 只有 1 個 division：GPT Division
- Division manager：Monica
- Monica 使用 GPT 5.5 作為 brain
- GPT Division 內有五組分析團隊
- 五組分析團隊也使用 GPT brain
- Monica 整合五組團隊報告，產生第一階段最終決策

最終架構目標：

- GPT Division：五組團隊都使用 GPT brain
- Claude Division：五組團隊都使用 Claude brain
- Gemini Division：五組團隊都使用 Gemini brain

每個 division 都有相同的五組團隊、相同的任務、相同的資料包與相同的輸出格式。差別在於每個 division 使用不同 AI 模型家族作為推理核心。

多 division 設計的目的：

- 降低單一模型偏誤
- 讓不同 AI 模型獨立判斷同一個投資問題
- 只有在多個 division 形成共識時才採取行動
- 若 division 之間意見分歧，系統預設採取保守策略

Division 擴充原則：

- Stage 1 的 GPT Division 是 canonical template。
- 未來建立 Division 2、Division 3 時，必須複製 GPT Division 的結構。
- 新 division 只能替換 manager、model provider、model name / brain，以及必要的 provider API 設定。
- 五組團隊名稱、任務流程、輸出格式、評分方式、performance tracking、influence points 規則都必須一致。
- 不允許每個 division 自行發明不同報告格式，否則 final committee 無法公平比較。
- 如果要修改 team structure 或 output schema，必須同步套用到所有 division。

Division Template：

```text
Division
  - division_name
  - division_manager
  - model_provider
  - model_name
  - brain_description
  - five teams:
      1. 基本面品質團隊
      2. 技術量價團隊
      3. 總經產業團隊
      4. 事件催化團隊
      5. 風險控管團隊
  - shared workflow:
      1. Market Review
      2. Portfolio Review
      3. Mission Analysis
      4. Market Scan
  - division manager decision
  - performance tracking
  - influence points
```

建立新 division 時需要填寫：

- Division 名稱
- Division manager 名稱
- Brain / model 名稱
- Model provider
- API key 設定方式
- 是否啟用
- 是否參與 final committee consensus

範例：

```text
Division 1
- Name: GPT Division
- Manager: Monica
- Brain: GPT 5.5
- Provider: OpenAI

Division 2
- Name: Claude Division
- Manager: TBD
- Brain: Claude model
- Provider: Anthropic

Division 3
- Name: Gemini Division
- Manager: TBD
- Brain: Gemini model
- Provider: Google
```

## 4.A 多模型 Division 架構

```text
Daily Data Package / Mission Package
        |
        v
GPT Division       Claude Division       Gemini Division
5 Teams            5 Teams               5 Teams
        |                  |                    |
        v                  v                    v
GPT Manager        Claude Manager        Gemini Manager
        \                  |                    /
         \                 |                   /
          v                v                  v
       Cross-Division Investment Committee
                    |
                    v
           Final Action / No Action
```

每個 division 內部流程：

1. 五組團隊收到同一份每日資料包或 Mission 資料包
2. 五組團隊各自完成 Market Review、Portfolio Review、Mission Analysis、Market Scan
3. 五組團隊把報告交給 division manager
4. division manager 整合該 division 的五份報告
5. division manager 產生 division-level decision
6. 三位 division manager 進行 cross-study
7. Cross-Division Investment Committee 產生最終 action call 或 no action

## 4.B Division Manager 設計

### Stage 1 Division Manager

名稱：Monica

Division：GPT Division

Brain：GPT 5.5

責任：

- 管理第一階段 GPT Division 的五組分析團隊
- 整合每日 Market Review、Portfolio Review、Mission Analysis、Market Scan
- 評估五組團隊的支持與反對理由
- 產生 GPT Division 最終建議
- 給出信心分數、買進區間、目標價、停損點與建議部位
- 在沒有足夠信心時選擇 wait 或 no action
- 記錄每次決策，供 Performance Dashboard 追蹤準確率

### GPT Division Manager

名稱：Monica

責任：

- 管理 GPT Division 的五組團隊
- 整合 GPT Division 內部分析
- 判斷 GPT Division 是否建議行動
- 說明 GPT 內部五組團隊之間的分歧
- 產生 GPT Division 最終建議與信心分數

### Claude Division Manager

名稱：沈孟潔 Claire Shen

責任：

- 管理 Claude Division 的五組團隊
- 整合 Claude Division 內部分析
- 判斷 Claude Division 是否建議行動
- 說明 Claude 內部五組團隊之間的分歧
- 產生 Claude Division 最終建議與信心分數

### Gemini Division Manager

名稱：羅柏翰 Brian Lo

責任：

- 管理 Gemini Division 的五組團隊
- 整合 Gemini Division 內部分析
- 判斷 Gemini Division 是否建議行動
- 說明 Gemini 內部五組團隊之間的分歧
- 產生 Gemini Division 最終建議與信心分數

## 4.C Division-Level Decision

每個 division manager 必須輸出：

- Division 名稱
- Division manager
- 今日市場觀點
- 投資組合建議
- Mission 建議
- Division 最終 Top 3 推薦
- 每檔推薦的買進區間
- 每檔推薦的目標價
- 每檔推薦的停損點
- 每檔推薦的建議部位
- Division 信心分數
- Division 內部主要支持理由
- Division 內部主要反對理由
- 哪些 team 支持
- 哪些 team 反對
- Division 最終建議：buy / small_buy / hold / wait / reduce / sell / avoid

範例：

```text
GPT Division Decision
- Mission：分析 Nvidia
- 建議：small_buy
- 買進區間：
- 目標價：
- 停損點：
- 建議部位：
- 信心分數：76%
- 支持理由：
- 反對理由：
- 內部分歧：
```

## 4.D Cross-Division Investment Committee

Cross-Division Investment Committee 會比較 GPT、Claude、Gemini 三個 division manager 的結論。

最重要原則：

- 三個 division 都同意，才形成 Action Call。
- 只要三個 division 沒有一致，預設不採取新行動。
- 若沒有共識，結果為 No Action / Wait。

這個設計的目的不是追求每天都有交易，而是提高行動品質。

## 4.E Consensus Rule 共識規則

共識不要求三個 division 用完全相同文字，但必須在主要行動類型上相同。

主要行動類型：

- buy
- small_buy
- hold
- wait
- reduce
- sell
- avoid

Strong Consensus：

- 三個 division 的主要行動類型一致
- 平均信心分數高於門檻，例如 70%
- 三個 division 的風險控管團隊都沒有否決
- 買進區間、目標價與停損點沒有重大衝突
- 沒有 division 提出重大未解決紅旗

Weak Consensus：

- 只有兩個 division 同意
- 或三個 division 方向接近但價格區間差異過大
- 或平均信心分數不足

No Consensus：

- 三個 division 意見分歧
- 任一 division 強烈反對行動
- 任一 division 發現重大風險
- 風險控管團隊提出否決且未被合理解決

使用者目前偏好的決策規則：

- Strong Consensus：可以採取行動
- Weak Consensus：不採取新行動，列為觀察
- No Consensus：不採取行動

## 4.F Final Committee Output

最終委員會輸出：

- Final action：act / no_action
- Action type：buy / small_buy / hold / wait / reduce / sell / avoid
- Consensus level：strong / weak / none
- GPT Division 結論
- Claude Division 結論
- Gemini Division 結論
- 三方同意點
- 三方分歧點
- 最終買進區間
- 最終目標價
- 最終停損點
- 最終建議部位大小
- 最終信心分數
- 是否符合行動門檻
- 採取行動或不採取行動的理由
- 哪個 division 最保守
- 哪個 division 最積極
- 什麼資料會改變最終決策

範例：

```text
Mission：分析 Nvidia

GPT Division：
- 建議：small_buy
- 信心：76%

Claude Division：
- 建議：wait
- 信心：68%

Gemini Division：
- 建議：small_buy
- 信心：71%

Final Committee：
- 結論：no_action
- 原因：三個 division 未形成 Strong Consensus
- 狀態：列入觀察，等待價格回落或新資料確認
```

另一個範例：

```text
Mission：分析 Nvidia

GPT Division：
- 建議：wait
- 信心：78%

Claude Division：
- 建議：wait
- 信心：74%

Gemini Division：
- 建議：wait
- 信心：80%

Final Committee：
- 結論：action_call
- 行動：wait
- 共識：strong
- 原因：三個 division 都同意等待更好的買點
```

## 4.G Performance Tracking 與 Influence Points

系統每天需要追蹤每個 team、division manager、以及 final committee 的判斷結果。

追蹤流程：

```text
Prediction -> Result Tracking -> Accuracy Score -> Influence Points -> Future Decision Weight
```

### 4.G.1 需要追蹤的每一筆建議

每一筆 team recommendation、division decision、final committee decision 都需要儲存：

- 日期
- 股票代號
- 市場
- 建議來源：team / division / final committee
- 來源名稱
- 行動：buy / small_buy / hold / wait / reduce / sell / avoid
- 建議買進區間
- 目標價
- 停損點
- 建議部位
- 建議持有期間
- 信心分數
- 實際 7 日結果
- 實際 30 日結果
- 實際 90 日結果
- 是否命中方向
- 若照建議執行的報酬率
- 最大回撤
- 是否觸發停損
- 是否達到目標價
- influence points 變化

### 4.G.2 Team Accuracy Rate

每組團隊都有自己的準確率與績效檔案。

範例：

```text
技術量價團隊
- 7-day accuracy: 64%
- 30-day accuracy: 58%
- 90-day accuracy: 52%
- average return: +3.2%
- average drawdown: -4.1%
- influence points: 72
```

不同團隊應使用不同的主要評估期間：

- 基本面品質團隊：30 日與 90 日結果較重要
- 技術量價團隊：7 日與 30 日結果較重要
- 總經產業團隊：30 日與 90 日市場方向較重要
- 事件催化團隊：7 日與事件窗口結果較重要
- 風險控管團隊：最大回撤、停損控制、避免虧損較重要

### 4.G.3 Division Accuracy Rate

每個 division 也要追蹤自己的績效。

範例：

```text
GPT Division
- recommendation accuracy: 61%
- average return if followed: +2.8%
- average drawdown: -3.9%
- risk-adjusted score: 68
- influence points: 74
```

需要追蹤：

- Division 建議準確率
- Division 平均報酬
- Division 最大回撤
- Division 信心校準程度
- Division 對 final committee 正確決策的貢獻
- Division 錯誤建議次數
- Division 避免錯誤交易次數

### 4.G.4 Influence Points 計算概念

第一版可以使用簡化公式：

```text
Influence Points =
Accuracy Score
+ Return Score
+ Risk Control Score
+ Confidence Calibration Score
```

分數來源：

- Accuracy Score：方向是否判斷正確
- Return Score：若照建議執行是否有正報酬
- Risk Control Score：是否避免重大回撤或控制虧損
- Confidence Calibration Score：高信心建議是否真的比低信心建議更準

重要規則：

- influence points 會影響最終信心與部位大小
- influence points 不得單獨推翻三 division 共識規則
- 高 influence division 若不同意，可以提高警戒或降低部位
- 低 influence division 若反對，仍需記錄，但影響力較低

### 4.G.5 Wait / Avoid / Sell 也需要評分

系統不能只追蹤 buy call。

也需要評估：

- 如果建議 wait，但股票大漲，可能代表錯過機會
- 如果建議 wait，而股票下跌，代表成功避開風險
- 如果建議 avoid，而股票下跌，應該加分
- 如果建議 sell，而股票之後下跌，應該加分
- 如果建議 sell，而股票之後大漲，應該扣分

這樣可以避免系統只鼓勵積極買進，而忽略保守判斷的價值。

## 4.H Performance Dashboard 詳細設計

### 4.H.1 Team Performance

每組 team 顯示：

- Accuracy rate
- 7 日準確率
- 30 日準確率
- 90 日準確率
- Average return
- Average drawdown
- Best call
- Worst call
- Confidence calibration
- Influence points
- Recommendation count
- Buy / wait / sell / avoid 的各自成功率

範例：

```text
技術量價團隊
- Accuracy: 64%
- Avg return: +3.2%
- Avg drawdown: -4.1%
- Influence points: 72
- Best call: NVDA +12.4%
- Worst call: TSLA -8.6%
```

### 4.H.2 Division Performance

每個 division 顯示：

- Division accuracy
- Average return if followed
- Average drawdown
- Risk-adjusted score
- Influence points
- Consensus contribution
- Correct action calls
- Avoided bad calls
- Internal team agreement rate
- Final committee adoption rate

### 4.H.3 Final Committee Performance

最終委員會顯示：

- Action-call accuracy
- No-action accuracy
- Average return
- Max drawdown
- Win rate
- Missed opportunity count
- Strong consensus success rate
- Weak consensus watchlist success rate
- No consensus avoidance result

### 4.H.4 Influence Points View

顯示：

- 哪些 team influence points 上升
- 哪些 team influence points 下降
- 哪些 division influence points 上升
- 哪些 division influence points 下降
- influence points 變化原因
- 目前 decision weight
- 近 7 日 / 30 日 / 90 日趨勢

### 4.H.5 Call History

表格欄位：

- 日期
- Team / Division / Committee
- 股票代號
- 市場
- 建議
- 信心分數
- 買進區間
- 目標價
- 停損點
- 7 日結果
- 30 日結果
- 90 日結果
- 是否命中
- influence points 變化

### 4.H.6 Performance Charts

建議圖表：

- Accuracy over time
- Influence points over time
- Average return by team
- Drawdown by team
- Confidence vs actual result
- Team comparison radar chart
- Division comparison chart
- Strong consensus success rate chart

## 4.I Team Member Agents 與 Agentic Task 設計

每一組 team 不應該只有一個大型 agent。每組 team 內部要拆成多個 member agents，各自負責資料收集、計算、分析、質疑與報告輸出。

核心原則：

- 每個 agent 有明確任務，不做所有事情。
- 每個 agent 只能使用與任務相關的工具。
- 每個 team 必須有一個 lead agent，由 team leader 擔任。
- 每個 team 必須有一個 skeptic / reviewer agent，負責找錯、質疑與降低過度自信。
- 所有 agent 的輸出都要回到 team leader，由 team leader 產生 team report。
- Stage 1 所有 agent 使用 GPT 5.5 brain。
- 未來新增 Claude Division 或 Gemini Division 時，複製同樣 agent 結構，只替換 brain / provider。

### 4.I.1 Agent 共用工具分類

Market Data Tools：

- 取得美股報價
- 取得台股報價或日終資料
- 取得歷史價格
- 取得指數資料
- 取得成交量
- 取得匯率

Fundamental Data Tools：

- 取得財報資料
- 取得營收資料
- 取得估值資料
- 取得公司基本資料
- 取得 ETF 持股與費用資料，如免費資料可取得

Technical Analysis Tools：

- 計算移動平均線
- 計算 RSI
- 計算 MACD
- 計算布林通道
- 偵測支撐與壓力
- 計算波動度與回撤

News / Event Tools：

- 搜尋公開新聞
- 讀取公司公告
- 讀取 TWSE / TPEx 重大訊息
- 讀取財報日期
- 讀取 RSS feeds
- 建立事件時間線

Portfolio Tools：

- 讀取持股
- 讀取關注清單
- 計算投資組合市值
- 計算資產配置
- 計算產業曝險
- 計算單股集中度
- 計算 unrealized gain / loss

Risk Tools：

- 計算最大回撤
- 計算波動度
- 計算停損距離
- 計算每筆交易最大可承受部位
- 計算市場、產業、幣別曝險

AI Reasoning Tools：

- GPT 5.5 structured analysis
- JSON schema validation
- report summarization
- contradiction detection
- confidence calibration

Storage Tools：

- 寫入 team_reports
- 寫入 recommendations
- 寫入 division_decisions
- 寫入 performance tracking records

### 4.I.2 基本面品質團隊 Agents

Team Leader：林品妍 Sophia Lin

Agent 1：Financial Statement Analyst

任務：

- 收集營收、EPS、毛利率、營益率、淨利率、現金流與負債資料
- 判斷公司財務體質是否改善或惡化
- 比較近幾季與近幾年的趨勢

工具：

- Fundamental Data Tools
- TWSE / TPEx public data
- US fundamental data API
- GPT 5.5 structured analysis

Agent 2：Valuation Analyst

任務：

- 計算本益比、股價淨值比、股價營收比
- 比較歷史估值區間
- 判斷目前價格是否合理、偏貴或偏便宜

工具：

- Fundamental Data Tools
- Market Data Tools
- valuation calculator
- GPT 5.5

Agent 3：Business Quality Analyst

任務：

- 分析公司競爭優勢、產業地位、成長動能
- 判斷長期持有價值
- 對 ETF 則分析費用率、追蹤標的與集中度

工具：

- News / Event Tools
- Fundamental Data Tools
- GPT 5.5

Agent 4：Fundamental Skeptic

任務：

- 找出財報中的弱點
- 質疑過高成長假設
- 檢查是否因為熱門題材而忽略估值風險
- 要求 team leader 降低過度自信

工具：

- Fundamental Data Tools
- valuation calculator
- GPT 5.5 contradiction detection

Team Leader 輸出：

- 公司品質評分
- 估值合理性
- 長期投資吸引力
- Portfolio Review
- Mission Analysis
- Market Scan 3 recommendations

### 4.I.3 技術量價團隊 Agents

Team Leader：陳昱翔 Marcus Chen

Agent 1：Trend Analyst

任務：

- 判斷大盤與個股趨勢
- 分析 20 / 50 / 120 / 200 日均線
- 判斷多頭、空頭或盤整

工具：

- Market Data Tools
- Technical Analysis Tools
- Lightweight Charts data
- GPT 5.5

Agent 2：Momentum Analyst

任務：

- 分析 RSI、MACD、成交量與相對強弱
- 判斷是否過熱、轉強或轉弱

工具：

- Historical price data
- Technical Analysis Tools
- GPT 5.5

Agent 3：Entry / Exit Planner

任務：

- 找出買進區間
- 找出目標價
- 找出停損點
- 建議短線、波段或等待

工具：

- Technical Analysis Tools
- support / resistance detector
- volatility calculator
- GPT 5.5

Agent 4：Technical Skeptic

任務：

- 檢查是否追高
- 檢查突破是否可能是假突破
- 檢查成交量是否不足
- 質疑過度樂觀的技術判斷

工具：

- Technical Analysis Tools
- historical price data
- GPT 5.5 contradiction detection

Team Leader 輸出：

- 趨勢狀態
- 買點、賣點、停損
- 技術面信心分數
- Portfolio Review
- Mission Analysis
- Market Scan 3 recommendations

### 4.I.4 總經產業團隊 Agents

Team Leader：王若庭 Vivian Wang

Agent 1：Macro Analyst

任務：

- 分析利率、通膨、美債殖利率與 Fed 政策方向
- 判斷市場 risk-on / risk-off

工具：

- FRED data
- Market index data
- FX data
- GPT 5.5

Agent 2：Sector Rotation Analyst

任務：

- 判斷哪些產業轉強或轉弱
- 分析 AI、半導體、金融、消費、能源等主題
- 比較台股與美股產業機會

工具：

- Market Data Tools
- sector exposure analyzer
- index / ETF data
- GPT 5.5

Agent 3：Taiwan / US Market Analyst

任務：

- 比較台股與美股目前吸引力
- 分析匯率對投資組合的影響
- 判斷資金應偏向台股、美股或現金

工具：

- TWSE / TPEx data
- US index data
- FX data
- GPT 5.5

Agent 4：Macro Skeptic

任務：

- 檢查總經結論是否太籠統
- 找出與市場價格不一致的地方
- 質疑錯誤的產業輪動假設

工具：

- Market Data Tools
- FRED data
- GPT 5.5 contradiction detection

Team Leader 輸出：

- 市場風險狀態
- 台股 / 美股配置建議
- 產業加減碼方向
- Portfolio Review
- Mission Analysis
- Market Scan 3 recommendations

### 4.I.5 事件催化團隊 Agents

Team Leader：張以安 Ethan Chang

Agent 1：News Scanner

任務：

- 搜尋個股與市場重要新聞
- 摘要正面與負面消息
- 過濾重複或低品質新聞

工具：

- News / Event Tools
- RSS feeds
- GPT 5.5 summarization

Agent 2：Earnings / Calendar Analyst

任務：

- 追蹤財報日期、法說會、產品發表與重大事件
- 判斷事件前後是否適合行動

工具：

- Company IR pages
- earnings calendar data
- TWSE / TPEx announcements
- GPT 5.5

Agent 3：Sentiment Analyst

任務：

- 判斷新聞與市場情緒偏正面或負面
- 分析市場預期是否過高或過低
- 找出可能的預期差

工具：

- News / Event Tools
- analyst revision data if free
- GPT 5.5 sentiment classification

Agent 4：Catalyst Skeptic

任務：

- 檢查新聞是否已經反映在股價
- 檢查催化因素是否只是短期雜訊
- 找出未消化的負面事件

工具：

- News / Event Tools
- price reaction data
- GPT 5.5 contradiction detection

Team Leader 輸出：

- 今日事件摘要
- 正面 / 負面催化
- 事件風險
- Portfolio Review
- Mission Analysis
- Market Scan 3 recommendations

### 4.I.6 風險控管團隊 Agents

Team Leader：許承睿 Daniel Hsu

Agent 1：Portfolio Exposure Analyst

任務：

- 計算單股、產業、市場與幣別曝險
- 找出過度集中的持股
- 判斷是否需要提高現金水位

工具：

- Portfolio Tools
- Risk Tools
- GPT 5.5

Agent 2：Drawdown / Volatility Analyst

任務：

- 計算個股與投資組合波動度
- 計算最大回撤
- 判斷目前風險是否超過設定

工具：

- Historical price data
- Risk Tools
- GPT 5.5

Agent 3：Position Sizing Analyst

任務：

- 根據停損距離與最大可承受虧損，計算建議部位
- 對每筆買進建議設定最大部位上限

工具：

- Portfolio Tools
- Risk Tools
- position sizing calculator
- GPT 5.5

Agent 4：Risk Skeptic

任務：

- 質疑所有過度積極的買進建議
- 檢查停損是否太寬或不合理
- 檢查是否低估相關性風險
- 可對 team 或 division 建議提出風險否決

工具：

- Risk Tools
- Portfolio Tools
- GPT 5.5 contradiction detection

Team Leader 輸出：

- 投資組合風險等級
- 單股與產業集中度
- 建議部位大小
- 減碼或停損建議
- Portfolio Review
- Mission Analysis
- Market Scan 3 recommendations

### 4.I.7 Agent Handoff 流程

每個 team 內部流程：

```text
Input Package
  -> Data Collector / Specialist Agents
  -> Calculation Agents
  -> Skeptic Agent
  -> Team Leader
  -> Team Report JSON
```

Division 內部流程：

```text
Five Team Reports
  -> Monica
  -> Division Decision
  -> Recommendations
  -> Performance Tracking
```

未來多 division 流程：

```text
GPT Division Decision
Claude Division Decision
Gemini Division Decision
  -> Cross-Division Investment Committee
  -> Final Action / No Action
```

### 4.I.8 Agent 執行規則

- Agent 不得編造資料；資料不足時必須標示 insufficient data。
- Agent 必須引用使用到的資料來源名稱與更新時間。
- Agent 的 recommendation 必須可追蹤，不能只給籠統看法。
- 每個 buy / sell / wait / avoid 建議都要有原因、價格區間、風險與信心分數。
- Skeptic agent 必須至少提出一個可能錯誤的地方，若沒有反對理由也要明確說明。
- Team leader 必須說明是否接受 skeptic agent 的質疑。
- Monica 必須說明是否接受每個 team leader 的觀點。
- 所有可執行建議都必須寫入 recommendations，供後續績效追蹤。

五組團隊必須分析同一份「每日投資資料包」，但每組只能從自己的專業角度出發。這樣 CIO 才能看到不同觀點，而不是五份相似的報告。

每組團隊都有兩種任務：

1. Daily Standing Tasks：每日固定任務
2. Mission Tasks：使用者指定任務

每日固定任務會自動執行，用來產生每日投資委員會報告。

Mission Tasks 由使用者主動建立，例如「今天分析 Nvidia」。五組團隊會針對同一個任務，從不同角度提供專業意見，再由 CIO 做最終結論。

每組團隊每次執行時，都必須完成四個固定工作區塊：

1. Market Review：市場檢查
2. Portfolio Review：投資組合檢查
3. Mission Analysis：指定任務分析
4. Market Scan：市場掃描與 3 檔推薦

這四個區塊是所有團隊的共同作業流程。差別在於每組團隊使用不同專業角度、資料來源與工具來回答。

每日投資資料包包含：

- 我的持股
- 我的關注清單
- 台股與美股主要指數
- 個股價格與歷史價格
- 個股基本面資料
- 公開新聞
- 匯率
- 前一日 CIO 決策與追蹤結果

Mission 任務資料包包含：

- 使用者原始問題
- 任務類型
- 相關股票或 ETF
- 相關市場
- 我的持股中是否已有該標的
- 我的關注清單中是否已有該標的
- 該標的價格與歷史價格
- 該標的基本面資料
- 相關新聞與事件
- 目前市場與產業背景
- 投資組合風險背景

## 4.0.1 每組團隊標準作業流程

### Step 1：Market Review 市場檢查

每組團隊先從自己的專業角度檢查市場。

需要回答：

- 今天市場發生什麼重要變化？
- 台股與美股目前是偏多、偏空，還是中性？
- 哪些產業或主題正在轉強？
- 哪些產業或主題正在轉弱？
- 目前市場環境對投資人是友善還是危險？
- 團隊對市場判斷的信心分數是多少？

各團隊角度：

- 基本面品質團隊：估值環境、企業獲利品質、財報趨勢
- 技術量價團隊：指數趨勢、支撐壓力、成交量與動能
- 總經產業團隊：利率、匯率、資金流、產業輪動
- 事件催化團隊：重大新聞、財報、政策、事件風險
- 風險控管團隊：波動度、回撤風險、市場壓力、曝險風險

### Step 2：Portfolio Review 投資組合檢查

市場檢查後，每組團隊必須檢查使用者目前持股，說明市場變化如何影響這些股票或 ETF。

每一檔持股需要回答：

- 目前市場狀況對這檔股票是正面、負面，還是中性？
- 建議動作：買進 / 加碼 / 持有 / 減碼 / 賣出 / 觀望
- 建議買進或加碼價格
- 建議目標價格
- 建議停損價格
- 信心分數
- 主要理由
- 主要風險
- 什麼情況下會改變建議

範例格式：

```text
NVDA:
- 建議：持有
- 理由：AI 需求仍強，但估值偏高且短線股價延伸
- 加碼買點：
- 目標價：
- 停損點：
- 信心分數：
- 主要風險：
```

### Step 3：Mission Analysis 指定任務分析

如果使用者建立任務，例如「今天分析 Nvidia」，每組團隊必須針對該任務做專門研究。

需要回答：

- 任務標的是什麼？
- 是否值得加入關注清單？
- 是否值得買進？
- 如果值得買，合理買進價格是多少？
- 目標價格是多少？
- 停損價格是多少？
- 建議持有期間是短線、波段，還是長期？
- 信心分數是多少？
- 最大風險是什麼？
- 需要等待什麼條件才行動？

Mission Analysis 不只用於單一股票，也可用於多股票比較、投資組合檢查、主題研究與事件分析。

### Step 4：Market Scan 市場掃描與 3 檔推薦

最後，每組團隊必須主動掃描市場，提出 3 檔股票或 ETF 推薦。

每一檔推薦都必須包含：

- 股票代號
- 股票名稱
- 市場：台股 / 美股
- 推薦理由
- 建議買進價格或區間
- 目標價格
- 停損價格
- 建議持有期間
- 信心分數
- 主要風險

重要規則：

- 每組團隊可以推薦不同標的。
- 如果市場風險過高，團隊可以少於 3 檔推薦，但必須說明原因。
- 不允許只給股票名稱，必須給出買點、目標、停損與理由。
- 若資料不足，必須標示資料不足，不可假裝有完整資訊。

### 4.1 Quality Team：基本面與公司品質團隊

中文名稱：基本面品質團隊

團隊主管：林品妍 Sophia Lin

主管角色：

- 投資風格：重視公司品質、現金流、估值安全邊際。
- 決策偏好：寧可錯過短線行情，也不買財務品質不清楚的公司。
- 主要責任：確認推薦標的是否有足夠基本面支撐。
- 反對權：若公司財務品質差、估值過高、或資訊不足，可要求 CIO 降低信心分數。

核心問題：

- 這家公司是不是值得長期持有？
- 目前價格相對公司品質是否合理？
- 財務體質是否支持未來成長？

主要分析範圍：

- 營收成長
- EPS 與獲利能力
- 毛利率、營益率、淨利率
- 現金流
- 負債與財務穩定性
- 本益比、股價淨值比、股價營收比
- 股利與資本配置

建議工具與資料來源：

- OpenAI GPT API：整理財報重點、產生分析結論
- Finnhub / Alpha Vantage / Twelve Data：美股基本面與財務資料，依免費額度選用
- TWSE / TPEx 公開資訊：台股營收、財報、公司基本資料
- 公開資訊觀測站資料：台股財報與重大訊息，若可穩定擷取再納入
- 自建 valuation calculator：計算本益比、成長率、估值分位

主要輸出：

- 公司品質評分
- 估值合理性評分
- 長期投資吸引力
- 持股中需要加碼、續抱或減碼的標的
- 關注清單中基本面最值得追蹤的標的
- 推薦 3 檔股票或 ETF

不負責：

- 短線進出場時機
- 新聞情緒判斷
- 投資組合整體風險上限

### 4.2 Chart Team：技術面與量價團隊

中文名稱：技術量價團隊

團隊主管：陳昱翔 Marcus Chen

主管角色：

- 投資風格：重視趨勢、量價結構、進出場紀律。
- 決策偏好：不在趨勢轉弱時硬買，也不在過度延伸時追高。
- 主要責任：提供可執行的買進區間、停損點與停利點。
- 反對權：若技術面明顯轉弱，可要求 CIO 將買進建議改為等待。

核心問題：

- 現在適不適合進場？
- 支撐、壓力、停損與停利點在哪裡？
- 趨勢是轉強、轉弱，還是盤整？

主要分析範圍：

- K 線與價格趨勢
- 成交量變化
- 20 / 50 / 120 / 200 日移動平均線
- RSI
- MACD
- 布林通道
- 支撐與壓力
- 相對強弱
- 突破、跌破、假突破

建議工具與資料來源：

- OpenAI GPT API：解讀技術指標與產生交易計畫
- 免費歷史價格 API：Finnhub / Alpha Vantage / Twelve Data / Stooq，依市場可用性選用
- TWSE / TPEx 歷史成交資料：台股價格與成交量
- technical indicators library：在後端自行計算 RSI、MACD、均線、波動度
- Lightweight Charts：前端顯示價格圖

主要輸出：

- 趨勢狀態：多頭 / 空頭 / 盤整
- 建議買進區間
- 建議停損點
- 建議停利點
- 技術面信心分數
- 不適合追高或需要等待回檔的標的
- 推薦 3 檔技術面較佳的股票或 ETF

不負責：

- 公司長期品質判斷
- 財報深度解讀
- 總體經濟判斷

### 4.3 Macro Team：總經、產業與資金流團隊

中文名稱：總經產業團隊

團隊主管：王若庭 Vivian Wang

主管角色：

- 投資風格：重視市場週期、資金流、產業輪動與匯率環境。
- 決策偏好：在風險偏好下降時先保護資金，在市場環境改善時提高曝險。
- 主要責任：判斷目前市場是否適合增加台股、美股或特定產業部位。
- 反對權：若總體環境偏 Risk-off，可要求 CIO 降低整體買進規模。

核心問題：

- 現在市場環境適合承擔風險嗎？
- 哪些產業或區域比較有機會？
- 台股、美股、匯率與利率環境對投資組合有什麼影響？

主要分析範圍：

- 美國利率與 Fed 政策
- 通膨
- 美債殖利率
- USD/TWD 匯率
- 台灣出口與半導體景氣
- 產業輪動
- 台股與美股大盤趨勢
- 地緣政治與政策風險

建議工具與資料來源：

- OpenAI GPT API：整理總經資料與產業結論
- FRED 免費資料：美國利率、通膨、殖利率等總經數據
- TWSE / TPEx / 政府開放資料：台灣市場與總體資料
- 免費匯率 API：Frankfurter 或其他可免費取得 USD/TWD 的來源
- 指數資料 API：取得 S&P 500、Nasdaq、Dow Jones、TAIEX 等資料
- 自建 sector exposure analyzer：計算投資組合產業曝險

主要輸出：

- 今日市場風險狀態：Risk-on / Neutral / Risk-off
- 台股與美股配置建議
- 產業加碼 / 減碼方向
- 匯率風險提醒
- 不適合增加曝險的市場或產業
- 推薦 3 檔符合總經與產業方向的股票或 ETF

不負責：

- 個股技術進場點
- 公司財報細節
- 每檔股票的最終部位大小

### 4.4 Catalyst Team：新聞、事件與市場情緒團隊

中文名稱：事件催化團隊

團隊主管：張以安 Ethan Chang

主管角色：

- 投資風格：重視事件、新聞、財報時程與市場預期差。
- 決策偏好：尋找短中期催化因素，但避免被雜訊帶著走。
- 主要責任：判斷近期事件是否足以推動或傷害股價。
- 反對權：若重大負面事件尚未被市場消化，可要求 CIO 暫停買進。

核心問題：

- 今天有哪些新聞或事件可能改變股價？
- 哪些公司有短期催化因素？
- 市場情緒是否過熱或過度悲觀？

主要分析範圍：

- 公司新聞
- 財報公布
- 法說會
- 分析師升降評
- 產品發表
- 監管與政策事件
- 併購、訴訟、供應鏈消息
- 社群與市場情緒，如可取得可靠免費資料

建議工具與資料來源：

- OpenAI GPT API：摘要新聞、判斷催化方向、過濾雜訊
- 免費新聞 API：Finnhub News、GNews、NewsAPI 免費額度，依限制選用
- 公司 IR 網站與公告頁：重大事件與財報日期
- TWSE / TPEx 重大訊息：台股事件資料
- RSS feeds：可免費取得的財經新聞與公司公告
- 自建 event scanner：記錄事件日期、影響方向與後續追蹤

主要輸出：

- 今日重要事件摘要
- 對持股的正面 / 負面催化
- 對關注清單的正面 / 負面催化
- 短期需要避開的標的
- 短期值得追蹤的標的
- 推薦 3 檔有明確催化因素的股票或 ETF

不負責：

- 單靠新聞決定買進
- 長期估值結論
- 投資組合最大風險控制

### 4.5 Risk Team：風險控管與投資組合團隊

中文名稱：風險控管團隊

團隊主管：許承睿 Daniel Hsu

主管角色：

- 投資風格：重視下檔風險、部位控制、現金水位與投資組合存活率。
- 決策偏好：先控制可能虧損，再追求可能獲利。
- 主要責任：設定單筆投資上限、停損距離、減碼建議與整體風險等級。
- 反對權：若部位過度集中、波動過高、或停損距離不合理，可要求 CIO 否決交易。

核心問題：

- 我的投資組合現在風險會不會太集中？
- 如果市場下跌，我可能損失多少？
- 每一筆新投資應該買多少才合理？

主要分析範圍：

- 單一股票集中度
- 單一市場集中度
- 單一產業集中度
- 波動度
- 最大回撤
- VaR 或簡化風險估算
- 流動性
- 匯率風險
- 停損距離與部位大小

建議工具與資料來源：

- OpenAI GPT API：整理風險說明與行動建議
- 自建 portfolio risk engine：計算配置、集中度、波動度、回撤
- 歷史價格 API：用於計算波動與回撤
- 匯率 API：計算 USD/TWD 風險
- 交易規則設定：每筆最大損失、單股上限、單產業上限、現金水位

主要輸出：

- 投資組合風險等級
- 是否需要減碼
- 是否需要提高現金水位
- 每檔推薦標的的最大建議部位
- 每檔標的的停損價格
- 不建議買進的高風險標的
- 推薦 3 檔風險報酬較合理的股票或 ETF

不負責：

- 尋找最熱門題材
- 單獨決定最終買賣
- 將高風險標的包裝成低風險

## 4.6 團隊工具分工總表

| 團隊 | 主要任務 | 必備工具 | 可選工具 | 核心輸出 |
| --- | --- | --- | --- | --- |
| 基本面品質團隊 | 判斷公司品質與估值 | GPT、基本面資料、財報資料 | valuation calculator | 品質評分、估值評分、長期推薦 |
| 技術量價團隊 | 判斷進出場時機 | GPT、歷史價格、技術指標計算 | Lightweight Charts | 買點、賣點、停損、趨勢 |
| 總經產業團隊 | 判斷市場環境與產業方向 | GPT、總經資料、指數資料、匯率 | sector exposure analyzer | 市場風險、產業配置、區域配置 |
| 事件催化團隊 | 判斷新聞與短期事件 | GPT、新聞 API、公告資料、RSS | event scanner | 催化因素、事件風險、短期機會 |
| 風險控管團隊 | 控制部位與下檔風險 | GPT、投資組合資料、歷史價格、匯率 | portfolio risk engine | 風險等級、部位上限、減碼建議 |

## 4.6.1 團隊主管總表

| 團隊 | 團隊主管 | 主管定位 | 主要反對權 |
| --- | --- | --- | --- |
| 基本面品質團隊 | 林品妍 Sophia Lin | 公司品質與估值守門人 | 財務品質差或估值過高 |
| 技術量價團隊 | 陳昱翔 Marcus Chen | 進出場時機與交易紀律負責人 | 趨勢轉弱或買點不佳 |
| 總經產業團隊 | 王若庭 Vivian Wang | 市場環境與產業方向負責人 | 總體環境不利或風險偏好下降 |
| 事件催化團隊 | 張以安 Ethan Chang | 新聞事件與短期催化負責人 | 負面事件未消化或催化不足 |
| 風險控管團隊 | 許承睿 Daniel Hsu | 部位大小與下檔風險負責人 | 風險過高、部位過大或停損不合理 |

## 4.7 每組團隊統一輸出格式

每組團隊必須輸出結構化 JSON，方便 CIO 讀取與比較。

```json
{
  "teamName": "基本面品質團隊",
  "date": "YYYY-MM-DD",
  "leader": "林品妍 Sophia Lin",
  "marketView": {
    "summary": "今日觀點",
    "marketBias": "bullish | neutral | bearish",
    "strongSectors": ["強勢產業"],
    "weakSectors": ["弱勢產業"],
    "riskLevel": "low | medium | high",
    "confidence": 0.0
  },
  "portfolioReview": [
    {
      "symbol": "AAPL",
      "market": "US",
      "name": "Apple",
      "action": "buy | add | hold | reduce | sell | watch",
      "reason": "原因",
      "marketImpact": "目前市場對此標的的影響",
      "buyZone": "建議買進或加碼區間",
      "targetPrice": "目標價",
      "stopLoss": "停損點",
      "keyRisks": ["主要風險"],
      "whatCouldChangeOurMind": ["改變判斷的條件"],
      "confidence": 0.0
    }
  ],
  "missionAnalysis": {
    "missionTitle": "分析 Nvidia",
    "missionType": "single_stock",
    "relatedSymbols": ["NVDA"],
    "summary": "任務分析摘要",
    "suggestion": "buy | wait | reject | hold | reduce | sell",
    "buyZone": "建議買進區間",
    "targetPrice": "目標價",
    "stopLoss": "停損點",
    "timeHorizon": "short | swing | long",
    "confidence": 0.0,
    "reason": "原因",
    "keyRisks": ["主要風險"],
    "conditionsToAct": ["需要等待的條件"]
  },
  "marketScanRecommendations": [
    {
      "symbol": "2330",
      "market": "TW",
      "name": "台積電",
      "reason": "推薦理由",
      "buyZone": "建議買進區間",
      "targetPrice": "目標價",
      "stopLoss": "停損點",
      "timeHorizon": "short | swing | long",
      "confidence": 0.0,
      "keyRisks": ["主要風險"]
    }
  ],
  "finalTeamView": {
    "summary": "團隊總結",
    "mostImportantAction": "今日最重要建議",
    "confidence": 0.0
  }
}
```

## 4.8 Mission 範例：分析 Nvidia

使用者任務：

```text
今天請分析 Nvidia。
```

系統會建立一個 Mission，並把同一份任務資料包交給五組團隊。

### 基本面品質團隊任務

問題：

- Nvidia 是否仍然是值得長期持有的高品質公司？
- 目前股價相對成長性是否合理？

需要回答：

- 營收與 EPS 成長是否持續
- Data center 業務是否仍是主要成長引擎
- 毛利率與獲利能力是否健康
- 估值是否過高
- 長期投資吸引力

### 技術量價團隊任務

問題：

- Nvidia 現在是否適合進場？
- 如果要買，合理買點、停損點與停利點在哪裡？

需要回答：

- 目前趨勢是多頭、空頭或盤整
- 是否過度延伸或追高
- 關鍵支撐與壓力
- 成交量是否支持上漲
- 建議買進區間與停損點

### 總經產業團隊任務

問題：

- 目前總經與 AI / 半導體產業環境是否支持 Nvidia？

需要回答：

- AI infrastructure 資本支出是否仍然強
- 半導體週期是否有利
- 美國利率與科技股估值環境是否有壓力
- 美中科技限制是否影響風險
- 美股大型科技股資金流是否仍然健康

### 事件催化團隊任務

問題：

- Nvidia 近期是否有足以影響股價的事件或新聞？

需要回答：

- 近期財報或法說會時程
- 分析師升降評
- 新產品或客戶消息
- 競爭對手動態
- 出口限制或監管風險
- 是否適合在事件前買進，或等事件後再判斷

### 風險控管團隊任務

問題：

- 如果買進 Nvidia，投資組合能承受多少風險？

需要回答：

- 目前是否已經持有 Nvidia
- 是否已經過度集中在 AI、半導體或美股科技股
- Nvidia 波動度是否過高
- 建議最大部位
- 停損距離是否合理
- 若判斷錯誤，最大可能損失是否可接受

### CIO 最終決策

CIO 需要整合五組團隊結論，產生：

- 最終建議：買進 / 小量買進 / 持有 / 等待 / 減碼 / 賣出
- 建議買進區間
- 建議部位大小
- 停損點
- 停利點
- 信心分數
- 最大風險
- 接受哪些團隊主管的看法
- 否決哪些團隊主管的看法
- 什麼情況下會改變決策

範例輸出格式：

```text
任務：分析 Nvidia

CIO 最終結論：
- 建議：等待
- 建議買進區間：
- 停損點：
- 停利點：
- 建議部位：
- 信心分數：
- 主要理由：
- 最大風險：
- 什麼情況下改變判斷：
```

## 5. CIO 與最終委員會決策邏輯

在單一 GPT Division 版本中，CIO 會整合五組團隊意見。

在多模型版本中，CIO 的概念會升級為 division manager 與 Cross-Division Investment Committee：

- GPT Division Manager 整合 GPT Division 的五組團隊
- Claude Division Manager 整合 Claude Division 的五組團隊
- Gemini Division Manager 整合 Gemini Division 的五組團隊
- Cross-Division Investment Committee 比較三個 division 的決策，產生最終 action call 或 no action

CIO / Division Manager 不只是平均五組意見，而是要進行判斷與取捨。

CIO / GPT Division Manager 角色：Monica

Brain：GPT 5.5

CIO 定位：

- GPT Division 最終決策負責人。
- 不直接取代五組團隊，而是整合、質疑、排序與控制行動。
- 必須在報告中說明接受或否決每位團隊主管建議的理由。
- 可以在市場風險過高時否決所有推薦，改為觀望或提高現金水位。
- 必須分別整合三類結果：投資組合建議、Mission 建議、市場掃描推薦。
- 必須從五組團隊最多 15 檔市場掃描推薦中，挑出最終值得考慮的標的。
- 在多模型版本中，單一 division manager 的建議不是最終交易指令，必須再交給 Cross-Division Investment Committee。

決策原則：

- 若基本面強但技術面弱，可能列為觀察，不立即買進。
- 若技術面強但基本面弱，只能列為短線或高風險標的。
- 若新聞催化強但風險控管團隊反對，需要降低部位。
- 若五組團隊高度一致，信心分數提高。
- 若意見分歧，CIO 必須說明分歧點與採取保守策略。
- 若風險控管團隊主管否決交易，CIO 必須明確說明是否接受否決，以及原因。
- 若基本面品質團隊與技術量價團隊方向相反，CIO 不得直接給出高信心買進。
- 若事件催化團隊發現重大負面事件，CIO 必須先處理事件風險，再談買進。
- 若總經產業團隊判斷市場為 Risk-off，CIO 必須降低整體部位或提高買進門檻。

CIO 每日輸出必須包含：

- 今日市場總結
- 我的投資組合行動清單
- Mission 最終結論
- 從五組團隊推薦中選出的最終 Top 3
- 每一檔最終推薦的買進區間
- 每一檔最終推薦的目標價
- 每一檔最終推薦的停損點
- 每一檔最終推薦的建議部位大小
- 信心分數
- 最大風險
- 哪些團隊主管支持
- 哪些團隊主管反對
- CIO 最終採納或否決的理由

## 6. 資料來源策略

### 6.1 原則

- 除 OpenAI / GPT API 以外，其餘 API 必須免費。
- 優先使用官方公開資料。
- 若免費資料無法提供真正即時報價，系統需清楚標示資料延遲。
- 需要設計資料供應商抽象層，方便未來替換資料源。

### 6.2 美國市場資料

可能使用免費 API：

- Finnhub
- Alpha Vantage
- Twelve Data
- Stooq
- Yahoo Finance 非官方資料來源需謹慎評估

用途：

- 美股報價
- 指數資料
- 歷史價格
- 部分基本面資料
- 新聞資料

### 6.3 台灣市場資料

可能使用資料來源：

- TWSE 官方公開資料
- TPEx 官方公開資料
- 政府開放資料平台
- 其他免費公開資料源

注意：

- 台股真正即時資料通常受授權限制。
- 第一版可先使用延遲或日終資料。
- 系統畫面需明確標示台股資料更新時間。

### 6.4 匯率資料

可能使用免費 API：

- exchangerate.host
- Frankfurter
- 其他免費外匯資料源

用途：

- USD/TWD 換算
- 投資組合總價值換算

## 7. 技術架構建議

### 7.1 前端與後端

建議使用：

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- lucide-react icons
- Recharts
- Lightweight Charts

原因：

- 適合快速建立個人 web app
- 前後端可放在同一專案
- 易於建立 dashboard 與資料頁面
- 方便加入 API routes 與排程任務
- shadcn/ui 適合建立專業 dashboard、表格、dialog、tabs、dropdown 與 form
- lucide-react 適合提供清楚、專業、統一的功能圖示
- Recharts 適合 portfolio allocation、performance、accuracy 與 influence points 圖表
- Lightweight Charts 適合股票價格圖、K 線與技術分析視覺化

### 7.1.1 UI 設計工具與原則

不需要額外 UI plugin。第一版 UI 由 Next.js、Tailwind CSS、shadcn/ui、lucide-react、Recharts、Lightweight Charts 建立。

設計定位：

- 專業投資 dashboard
- 繁體中文介面
- 個人投資決策工作台
- 資訊密度高，但不要雜亂
- 桌面優先，手機可用
- 不做 landing page，打開後直接進入可用 dashboard

視覺原則：

- 安靜、專業、金融工具感
- 避免行銷式大 hero
- 避免過度裝飾
- 避免太多卡片堆疊
- 以表格、圖表、狀態標籤、篩選器、tabs 為主
- 綠色與紅色只用於漲跌、風險或行動狀態，不作為整體主色過度使用
- 重要資訊要能快速掃描：今日結論、持股風險、買賣建議、信心分數

主要 UI 元件：

- Dashboard summary cards
- Portfolio table
- Watchlist table
- Market index panels
- Mission creation form
- Mission result page
- Team report tabs
- Division comparison table
- Final committee decision panel
- Performance dashboard charts
- Influence points leaderboard
- Recommendation history table

圖示工具：

- 使用 lucide-react
- 常用圖示：search、plus、trash、edit、refresh、calendar、bar chart、line chart、alert、check、x、target、shield、trending up、trending down

圖表工具：

- Recharts：資產配置、報酬率、準確率、influence points 趨勢
- Lightweight Charts：股票價格、K 線、均線、支撐壓力

UI 驗證流程：

1. 啟動本機開發網站
2. 用 Browser / Playwright 檢查畫面
3. 測試 desktop viewport
4. 測試 mobile viewport
5. 檢查繁體中文文字是否溢出
6. 檢查表格、tabs、dialog、charts 是否可讀
7. 檢查紅綠漲跌色是否清楚
8. 檢查 dashboard 是否能在第一眼看到重點
9. 修正 spacing、overflow、alignment、responsive layout

第一版 UI 技術選擇：

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
lucide-react
Recharts
Lightweight Charts
Supabase
OpenAI GPT API
```

第一版先做 GPT Division，但架構保留 Claude Division 與 Gemini Division 的擴充空間。

### 7.2 資料庫

建議使用：

- Supabase Postgres

主要資料表：

- users
- portfolio_holdings
- watchlist_items
- market_snapshots
- analyst_reports
- cio_decisions
- daily_runs

### 7.3 AI 分析流程

流程：

1. 建立每日輸入資料包
2. 五組分析團隊各自產生 JSON 格式報告
3. 驗證 JSON 格式
4. CIO 讀取五份報告
5. CIO 產生最終決策
6. 儲存分析結果
7. 顯示在網頁上

### 7.4 Supabase 資料庫 Schema 初版

第一版使用 Supabase Postgres。即使目前是個人使用，資料表仍保留 `user_id`，方便未來加入登入、同步、多裝置使用與 Row Level Security。

安全原則：

- public schema 內所有使用者資料表都要啟用 RLS。
- 每一筆個人資料都以 `user_id` 綁定 `auth.users.id`。
- 使用者只能讀寫自己的 portfolio、watchlist、missions、reports、settings。
- 市場公開資料可設計成 read-only shared data，不一定需要每位使用者各存一份。
- 不在前端暴露 Supabase service role key。
- 第一版先不使用複雜 database function，避免權限與 RLS 風險。

#### 7.4.1 使用者與設定

`families`

用途：定義家庭群組。系統不公開，只允許家庭成員使用。

主要欄位：

- `id uuid primary key`
- `name text`
- `created_by uuid references auth.users(id)`
- `created_at timestamptz`
- `updated_at timestamptz`

`family_memberships`

用途：定義使用者屬於哪個家庭，以及角色與權限。

主要欄位：

- `id uuid primary key`
- `family_id uuid references families(id)`
- `user_id uuid references auth.users(id)`
- `role text`
- `can_view_family_portfolios boolean default false`
- `can_manage_family_members boolean default false`
- `created_at timestamptz`
- `updated_at timestamptz`

角色：

- `family_admin`
- `family_member`

`profiles`

用途：儲存使用者基本設定。

主要欄位：

- `id uuid primary key references auth.users(id)`
- `family_id uuid references families(id)`
- `display_name text`
- `base_currency text default 'TWD'`
- `timezone text default 'Asia/Taipei'`
- `created_at timestamptz`
- `updated_at timestamptz`

`user_settings`

用途：儲存個人投資偏好與系統設定。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `max_single_position_pct numeric`
- `max_sector_exposure_pct numeric`
- `max_market_exposure_pct numeric`
- `default_stop_loss_pct numeric`
- `min_consensus_level text default 'strong'`
- `min_confidence_for_action numeric default 70`
- `daily_run_time text`
- `notification_channel text`
- `created_at timestamptz`
- `updated_at timestamptz`

#### 7.4.2 股票與市場資料

`securities`

用途：股票、ETF、指數的主資料表。

主要欄位：

- `id uuid primary key`
- `symbol text`
- `market text`
- `name text`
- `security_type text`
- `currency text`
- `exchange text`
- `sector text`
- `industry text`
- `is_active boolean default true`
- `created_at timestamptz`
- `updated_at timestamptz`

唯一鍵：

- `(symbol, market)`

`security_prices`

用途：儲存個股與 ETF 價格資料。

主要欄位：

- `id uuid primary key`
- `security_id uuid references securities(id)`
- `price_date date`
- `open numeric`
- `high numeric`
- `low numeric`
- `close numeric`
- `adjusted_close numeric`
- `volume numeric`
- `source text`
- `source_updated_at timestamptz`
- `created_at timestamptz`

唯一鍵：

- `(security_id, price_date, source)`

`market_indices`

用途：儲存台美主要指數資料。

主要欄位：

- `id uuid primary key`
- `symbol text`
- `market text`
- `name text`
- `currency text`
- `source text`
- `created_at timestamptz`
- `updated_at timestamptz`

`market_index_prices`

用途：儲存指數每日資料。

主要欄位：

- `id uuid primary key`
- `index_id uuid references market_indices(id)`
- `price_date date`
- `open numeric`
- `high numeric`
- `low numeric`
- `close numeric`
- `change_pct numeric`
- `source text`
- `source_updated_at timestamptz`
- `created_at timestamptz`

`fx_rates`

用途：儲存匯率，例如 USD/TWD。

主要欄位：

- `id uuid primary key`
- `base_currency text`
- `quote_currency text`
- `rate_date date`
- `rate numeric`
- `source text`
- `created_at timestamptz`

唯一鍵：

- `(base_currency, quote_currency, rate_date, source)`

#### 7.4.3 投資組合與關注清單

`portfolio_holdings`

用途：使用者手動輸入的持股。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `security_id uuid references securities(id)`
- `shares numeric`
- `average_cost numeric`
- `cost_currency text`
- `strategy text`
- `notes text`
- `opened_at date`
- `is_active boolean default true`
- `created_at timestamptz`
- `updated_at timestamptz`

`portfolio_transactions`

用途：未來若要追蹤買賣紀錄，可儲存交易流水。第一版可選擇先不做。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `security_id uuid references securities(id)`
- `transaction_type text`
- `trade_date date`
- `shares numeric`
- `price numeric`
- `currency text`
- `fees numeric`
- `notes text`
- `created_at timestamptz`

`watchlist_items`

用途：使用者關注清單。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `security_id uuid references securities(id)`
- `visibility text default 'private'`
- `reason text`
- `target_buy_price numeric`
- `alert_price numeric`
- `status text`
- `notes text`
- `created_at timestamptz`
- `updated_at timestamptz`

#### 7.4.4 每日分析與 Mission

`divisions`

用途：定義每個 AI division。Stage 1 只有 GPT Division；未來新增 Claude Division 或 Gemini Division 時，必須依照 GPT Division template 建立。

主要欄位：

- `id uuid primary key`
- `name text`
- `manager_name text`
- `model_provider text`
- `model_name text`
- `brain_description text`
- `is_enabled boolean default true`
- `participates_in_committee boolean default true`
- `sort_order integer`
- `created_at timestamptz`
- `updated_at timestamptz`

第一階段資料：

```text
name: GPT Division
manager_name: Monica
model_provider: OpenAI
model_name: GPT 5.5
brain_description: GPT 5.5 reasoning brain for Stage 1 investment committee
```

`division_teams`

用途：定義每個 division 底下的五組 team。新 division 建立時要複製同一組 team structure。

主要欄位：

- `id uuid primary key`
- `division_id uuid references divisions(id)`
- `team_name text`
- `team_leader text`
- `team_role text`
- `sort_order integer`
- `is_enabled boolean default true`
- `created_at timestamptz`
- `updated_at timestamptz`

每個 division 必須包含：

- 基本面品質團隊
- 技術量價團隊
- 總經產業團隊
- 事件催化團隊
- 風險控管團隊

`team_agents`

用途：定義每個 team 底下的 member agents。新 division 建立時，要依照 canonical template 複製同樣 agent 結構。

主要欄位：

- `id uuid primary key`
- `division_team_id uuid references division_teams(id)`
- `agent_name text`
- `agent_role text`
- `agent_type text`
- `tool_groups text[]`
- `task_description text`
- `sort_order integer`
- `is_required boolean default true`
- `is_enabled boolean default true`
- `created_at timestamptz`
- `updated_at timestamptz`

`agent_runs`

用途：儲存每次 agent 執行結果。第一版可先不顯示在 UI，但保留資料結構方便 debug、audit 與未來績效追蹤。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `daily_run_id uuid references daily_runs(id)`
- `mission_id uuid references missions(id)`
- `team_agent_id uuid references team_agents(id)`
- `status text`
- `input_summary text`
- `tools_used jsonb`
- `output jsonb`
- `confidence numeric`
- `started_at timestamptz`
- `completed_at timestamptz`
- `error_message text`
- `created_at timestamptz`

`daily_runs`

用途：記錄每日分析任務。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `run_date date`
- `status text`
- `data_package jsonb`
- `started_at timestamptz`
- `completed_at timestamptz`
- `created_at timestamptz`

`missions`

用途：使用者指定任務，例如分析 Nvidia。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `visibility text default 'private'`
- `title text`
- `mission_type text`
- `original_question text`
- `status text`
- `related_symbols text[]`
- `related_security_ids uuid[]`
- `data_package jsonb`
- `created_at timestamptz`
- `started_at timestamptz`
- `completed_at timestamptz`

`team_reports`

用途：儲存每個 team 的分析報告。可對應 daily run 或 mission。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `daily_run_id uuid references daily_runs(id)`
- `mission_id uuid references missions(id)`
- `division text`
- `team_name text`
- `team_leader text`
- `model_provider text`
- `model_name text`
- `report_type text`
- `market_view jsonb`
- `portfolio_review jsonb`
- `mission_analysis jsonb`
- `market_scan_recommendations jsonb`
- `final_team_view jsonb`
- `confidence numeric`
- `created_at timestamptz`

`division_decisions`

用途：儲存 GPT / Claude / Gemini division manager 的決策。

第一階段只會使用 GPT Division，division manager 為 Monica，model provider 為 OpenAI，model name 為 GPT 5.5。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `daily_run_id uuid references daily_runs(id)`
- `mission_id uuid references missions(id)`
- `division text`
- `division_manager text`
- `model_provider text`
- `decision_action text`
- `confidence numeric`
- `market_summary text`
- `portfolio_actions jsonb`
- `mission_decision jsonb`
- `top_recommendations jsonb`
- `supporting_teams text[]`
- `opposing_teams text[]`
- `internal_disagreements jsonb`
- `created_at timestamptz`

`committee_decisions`

用途：儲存 Cross-Division Investment Committee 最終結果。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `daily_run_id uuid references daily_runs(id)`
- `mission_id uuid references missions(id)`
- `final_action text`
- `action_type text`
- `consensus_level text`
- `confidence numeric`
- `weighted_confidence numeric`
- `decision_summary text`
- `agreement_summary text`
- `disagreement_summary text`
- `final_recommendations jsonb`
- `division_inputs jsonb`
- `is_action_allowed boolean`
- `created_at timestamptz`

#### 7.4.5 建議、結果追蹤與 Influence Points

`recommendations`

用途：將 team、division、committee 的每一筆股票建議拆成可追蹤資料。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `source_type text`
- `source_id uuid`
- `source_name text`
- `division text`
- `team_name text`
- `security_id uuid references securities(id)`
- `recommendation_date date`
- `action text`
- `buy_zone_low numeric`
- `buy_zone_high numeric`
- `target_price numeric`
- `stop_loss numeric`
- `position_size_pct numeric`
- `time_horizon text`
- `confidence numeric`
- `reason text`
- `key_risks jsonb`
- `status text`
- `created_at timestamptz`

`recommendation_outcomes`

用途：追蹤建議 7 日、30 日、90 日後結果。

主要欄位：

- `id uuid primary key`
- `recommendation_id uuid references recommendations(id)`
- `evaluation_date date`
- `horizon_days integer`
- `start_price numeric`
- `end_price numeric`
- `return_pct numeric`
- `max_drawdown_pct numeric`
- `hit_target boolean`
- `hit_stop_loss boolean`
- `direction_correct boolean`
- `missed_opportunity boolean`
- `score_delta numeric`
- `notes text`
- `created_at timestamptz`

`performance_snapshots`

用途：每天儲存 team、division、committee 的績效快照。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `snapshot_date date`
- `entity_type text`
- `entity_name text`
- `division text`
- `accuracy_7d numeric`
- `accuracy_30d numeric`
- `accuracy_90d numeric`
- `average_return_pct numeric`
- `average_drawdown_pct numeric`
- `win_rate numeric`
- `recommendation_count integer`
- `best_call jsonb`
- `worst_call jsonb`
- `created_at timestamptz`

`influence_scores`

用途：儲存每個 team、division、committee 的 influence points。

主要欄位：

- `id uuid primary key`
- `user_id uuid references profiles(id)`
- `family_id uuid references families(id)`
- `entity_type text`
- `entity_name text`
- `division text`
- `score_date date`
- `accuracy_score numeric`
- `return_score numeric`
- `risk_control_score numeric`
- `confidence_calibration_score numeric`
- `influence_points numeric`
- `decision_weight numeric`
- `change_reason text`
- `created_at timestamptz`

#### 7.4.6 資料來源與稽核

`data_sources`

用途：記錄免費 API 或公開資料來源。

主要欄位：

- `id uuid primary key`
- `name text`
- `source_type text`
- `base_url text`
- `market text`
- `is_free boolean default true`
- `rate_limit_notes text`
- `is_active boolean default true`
- `created_at timestamptz`
- `updated_at timestamptz`

`data_fetch_logs`

用途：記錄每日資料抓取狀態。

主要欄位：

- `id uuid primary key`
- `source_id uuid references data_sources(id)`
- `fetch_type text`
- `status text`
- `started_at timestamptz`
- `completed_at timestamptz`
- `error_message text`
- `rows_inserted integer`
- `created_at timestamptz`

#### 7.4.7 初版關聯摘要

```text
profiles
  -> families
  -> family_memberships
  -> user_settings
  -> portfolio_holdings
  -> watchlist_items
  -> daily_runs
  -> missions
  -> team_reports
  -> division_decisions
  -> committee_decisions
  -> recommendations
  -> performance_snapshots
  -> influence_scores

securities
  -> security_prices
  -> portfolio_holdings
  -> watchlist_items
  -> recommendations

recommendations
  -> recommendation_outcomes
```

#### 7.4.8 Schema 設計備註

- `team_reports` 保留大量 `jsonb`，因為 AI 報告內容會逐步調整。
- `recommendations` 必須結構化，因為後續績效追蹤與 influence points 需要穩定欄位。
- `daily_runs` 與 `missions` 都可以連到 team reports、division decisions、committee decisions。
- `source_id uuid` 在 `recommendations` 先保留彈性，之後可改成更嚴格的多型關聯或拆表。
- 第一版可以先建核心表：`profiles`、`securities`、`portfolio_holdings`、`watchlist_items`、`missions`、`team_reports`、`division_decisions`、`committee_decisions`、`recommendations`、`recommendation_outcomes`。
- Performance 相關表可以在第一版後段再建立，但 schema 應先保留設計。
- Family-private 系統仍然需要 RLS，避免不同家庭成員或未授權帳號讀到不該看的資料。
- `family_id` 用於家庭層級共享與 family admin 權限。
- `user_id` 用於個人資料歸屬。
- `visibility` 用於區分 private / family_shared。
- 初版可先讓 family_admin 管理所有家庭資料，family_member 只管理自己的資料。

## 8. 頁面結構草案

- `/dashboard`：總覽
- `/portfolio`：我的投資組合
- `/watchlist`：關注清單
- `/markets`：市場指數
- `/analysis/daily`：每日分析
- `/analysis/cio`：CIO 決策中心
- `/missions`：任務中心
- `/missions/[id]`：單一任務分析結果
- `/performance`：績效儀表板
- `/performance/teams`：團隊績效
- `/performance/divisions`：Division 績效
- `/performance/history`：建議紀錄與追蹤
- `/reports`：歷史報告
- `/settings`：設定

## 9. MVP 範圍

第一版先完成：

- 繁體中文介面
- 手動新增、編輯、刪除持股
- 手動新增、編輯、刪除關注清單
- 美股免費資料源串接
- 台股免費公開資料源串接
- 台美主要指數摘要
- 每日五組分析團隊報告
- CIO 最終決策
- Mission Center 任務中心
- 單一股票 Mission，例如分析 Nvidia
- Performance Dashboard 績效儀表板
- Team / Division / Final Committee 準確率追蹤
- Influence points 初版計算
- 歷史報告儲存

第一版暫不做：

- 券商串接
- 付費資料源
- 多使用者商業化
- 自動下單
- 真正高頻即時交易系統

## 10. 開發階段

### Phase 1：產品規格

- 確認所有頁面
- 確認資料欄位
- 確認五組分析團隊 prompt
- 確認 CIO 決策格式
- 確認免費資料源候選清單

### Phase 2：MVP 介面

- 建立 Next.js 專案
- 建立繁體中文 layout
- 建立 dashboard
- 建立 portfolio CRUD
- 建立 watchlist CRUD

### Phase 3：資料串接

- 串接美股報價
- 串接台股公開資料
- 串接指數資料
- 串接匯率資料
- 建立資料更新時間標示

### Phase 4：AI 分析系統

- 建立每日資料包
- 建立五組分析團隊
- 建立 CIO 決策流程
- 儲存分析報告
- 顯示每日分析結果

### Phase 5：優化與驗證

- 加入圖表
- 加入錯誤處理
- 加入資料缺漏提示
- 加入風險提示
- 測試不同持股與關注清單情境

## 11. 風險與限制

- 免費 API 可能有流量限制。
- 台股真正即時報價可能無法免費取得。
- AI 分析品質取決於輸入資料品質。
- 系統不能保證投資獲利。
- 公開新聞與資料可能延遲或不完整。
- 若未來公開使用，可能涉及投資建議與法規合規問題。

## 12. 待決策事項

- 是否要登入功能，或只做本機個人使用？
- 是否使用 Supabase，或先用本機資料庫？
- 美股第一個免費資料源選哪一個？
- 台股第一版使用哪個官方公開資料集？
- 每日分析執行時間：台灣時間早上、台股收盤後，或美股收盤後？
- 是否需要 email / LINE / Telegram 通知？
- 五組團隊是否採用目前版本：基本面品質、技術量價、總經產業、事件催化、風險控管？
- 每組團隊是否都必須推薦 3 檔，或允許在市場風險高時推薦少於 3 檔？
- CIO 是否可以否決所有團隊建議並建議全部觀望？

## 13. 下一步

建議下一步先完成：

1. 決定 MVP 的資料庫方式。
2. 決定第一版 UI 風格。
3. 建立 Next.js 專案。
4. 建立 portfolio 與 watchlist 的資料模型。
5. 先完成可手動使用的繁體中文 dashboard。

## 14. Stage 1 決策紀錄

### 14.1 MVP Boundary

Stage 1 確認範圍：

- 單一 division：GPT Division
- Division manager：Monica
- Brain：GPT 5.5
- 五組分析團隊
- 手動輸入 portfolio
- 手動輸入 watchlist
- Mission Center
- Daily analysis manual run
- Timer refresh
- Performance Dashboard 初版
- Supabase schema
- GPT / OpenAI API
- 不做 Claude Division
- 不做 Gemini Division
- 不做券商串接
- 不做自動下單
- 不做公開商業版

### 14.2 Stage 1 資料來源決策

原則：

- 台股優先使用官方公開資料。
- 美股優先使用穩定免費 API。
- 所有非 GPT API 必須免費。
- 如果免費資料不是即時資料，系統內部要記錄資料延遲與更新時間。
- UI 不需要額外法律標籤，但系統資料層仍需保存 source 與 timestamp，避免分析引用過期資料。

#### 台股資料來源

Primary：

- TWSE 官方公開資料與政府開放資料平台
- TPEx 官方公開資料

用途：

- 台股個股日終價格
- 台股大盤指數
- 櫃買資料
- 重大訊息與公開統計資料

原因：

- 官方來源最可信。
- 政府開放資料平台顯示 TWSE 加權指數歷史資料為免費且每日更新。
- TPEx 官方資料頁顯示真正即時資訊屬付費產品，因此 Stage 1 不假設可免費取得完整台股即時報價。

Stage 1 結論：

- 台股先使用官方延遲 / 日終 / 歷史資料。
- 若之後找到合法免費即時來源，再透過 MarketDataProvider 替換或新增。

#### 美股資料來源

Primary：

- Finnhub

用途：

- 美股 quote
- 美股公司資料
- 美股新聞
- 部分基本面資料

Backup / Secondary：

- Alpha Vantage

用途：

- 美股歷史價格
- 技術指標資料
- 基本面資料
- FX / macro backup

原因：

- Finnhub 官方文件提供 stock API、quote、company fundamentals、news 等功能。
- Finnhub 有明確 rate limit 文件。
- Alpha Vantage 官方資料顯示多數 API endpoint 可免費使用，但標準免費額度有限，適合作為 backup 或低頻資料源。

Stage 1 結論：

- 美股即時 / near-real-time quote 優先使用 Finnhub。
- Alpha Vantage 作為 backup、fundamental、technical indicator 與低頻資料來源。
- 若免費限制不足，系統要降級為 manual refresh / cached data，而不是改用付費 API。

#### 匯率資料來源

Primary：

- Frankfurter

用途：

- USD/TWD 匯率
- 投資組合 TWD / USD 換算
- 歷史匯率

原因：

- Frankfurter 是免費、open-source、免 API key 的匯率 API。
- 適合個人 dashboard 與日更新需求。

Backup：

- Alpha Vantage FX

#### 總經資料來源

Primary：

- FRED API

用途：

- 美國利率
- 通膨
- 美債殖利率
- GDP
- 就業等總經資料

原因：

- FRED 是 Federal Reserve Bank of St. Louis 的經濟資料服務。
- 適合總經產業團隊使用。

### 14.3 使用者設定初版建議

使用者目前不確定投資限制，因此 Stage 1 採用保守預設值，之後可在 Settings 頁面調整。

建議預設：

- 單一股票最大部位：15%
- 單一 ETF 最大部位：25%
- 單一產業最大曝險：35%
- 單一市場最大曝險：70%
- AI / 半導體主題最大曝險：40%
- 單筆交易最大可承受損失：1.5% portfolio value
- 預設停損：8% 到 12%，由風險控管團隊依波動度調整
- 最低 action confidence：70
- Monica 可以提出 buy / small_buy / hold / wait / reduce / sell / avoid
- 推薦標的可以來自 portfolio、watchlist 或市場掃描
- 若資料不足，Monica 必須選擇 wait 或 insufficient data

### 14.4 Scoring 與 Influence Points 初版建議

第一版先使用簡單、可解釋的 scoring。

Team / Division influence points：

```text
Influence Points =
0.35 * Accuracy Score
+ 0.25 * Return Score
+ 0.25 * Risk Control Score
+ 0.15 * Confidence Calibration Score
```

初始分數：

- 每個 team 初始 influence points：50
- GPT Division 初始 influence points：50
- Monica 初始 influence points：50

更新頻率：

- 每天 refresh 時更新已到期的 7 日、30 日、90 日 outcome
- 每次完成 outcome 評估後更新 influence points

時間權重：

- 基本面品質團隊：30 日與 90 日權重較高
- 技術量價團隊：7 日與 30 日權重較高
- 總經產業團隊：30 日與 90 日權重較高
- 事件催化團隊：7 日與事件窗口權重較高
- 風險控管團隊：drawdown、stop-loss、avoid bad calls 權重較高

重要規則：

- influence points 影響 confidence 與 position size。
- influence points 不直接取代 Monica 的判斷。
- 未來多 division 時，influence points 不取代三 division consensus rule。

### 14.5 Refresh 與 Timer 設計

Stage 1 支援：

- Manual refresh
- Manual run daily analysis
- Manual run mission
- Timer refresh

Timer refresh 初版設定：

- 使用者可在 Settings 設定 refresh interval
- 建議 interval：15 分鐘、30 分鐘、60 分鐘、手動
- 台股資料若是日終資料，不需要高頻 refresh
- 美股 quote 可用較短 refresh interval，但需遵守免費 API rate limit
- 每次 refresh 都要寫入 data_fetch_logs
- 若 API rate limit 接近上限，系統自動降低 refresh frequency

Stage 1 不做：

- 自動下單
- 背景高頻交易
- 付費 real-time data feed

### 14.6 我需要教使用者的部分

建立過程中需要教使用者：

- 如何取得 OpenAI API key
- 如何取得 Finnhub free API key
- 如何取得 Alpha Vantage free API key
- 如何取得 FRED API key
- 如何設定 Supabase project
- 如何設定 environment variables
- 如何手動輸入 portfolio
- 如何建立 watchlist
- 如何建立 Mission
- 如何閱讀 Monica 的 decision
- 如何看 Performance Dashboard
- 如何理解 influence points
- 如何判斷資料是否延遲

## 15. 系統可靠性與驗收規則

### 15.1 Data Quality Rules

Monica 與所有 agents 必須知道資料品質，不能把延遲、缺漏或衝突資料當成完整即時資料。

資料品質狀態：

- fresh：資料在可接受時間內更新
- delayed：資料可用，但不是即時
- stale：資料過舊，不適合產生高信心建議
- missing：資料缺漏
- conflicting：不同資料源結果衝突

建議規則：

- 美股 quote 若超過 30 分鐘未更新，標記為 delayed。
- 美股 quote 若超過 1 個交易日未更新，標記為 stale。
- 台股若使用日終資料，預設標記為 delayed，但可用於每日分析。
- 台股日終資料若超過 2 個交易日未更新，標記為 stale。
- 財報或基本面資料若超過一季未更新，標記為 delayed。
- 新聞資料若超過 24 小時未更新，事件催化團隊需降低信心。
- 若 primary 與 backup data source 價格差異超過 1%，標記為 conflicting。
- 若資料為 stale 或 conflicting，Monica 的 action confidence 上限為 60。
- 若關鍵資料 missing，Monica 必須選擇 wait 或 insufficient data。
- 所有報告都要保存 data_source 與 source_updated_at。

### 15.2 Prompt 與 JSON Contracts

所有 agent、team leader、Monica、future division manager 都必須使用固定輸出格式。

目的：

- 讓資料可以存入 Supabase
- 讓 team / division / committee 可以公平比較
- 讓 performance tracking 可以自動評分
- 避免 AI 輸出變成不可解析的文字

規則：

- Agent output 必須是 JSON。
- Team report 必須是 JSON。
- Division decision 必須是 JSON。
- Committee decision 必須是 JSON。
- Recommendation 必須拆成結構化欄位。
- JSON invalid 時，系統要嘗試 repair 一次。
- Repair 仍失敗時，該 agent / team run 標記為 failed。
- 不允許把價格、信心分數、action type 只藏在自然語言裡。

### 15.3 Audit Trail

每次分析都要留下可追蹤紀錄。

需要保存：

- 使用者問題
- daily run 或 mission id
- data package snapshot
- 使用資料來源
- 資料更新時間
- model provider
- model name
- prompt version
- agent output
- team leader output
- Monica decision
- recommendations
- influence points 當時分數
- Monica 接受或拒絕各 team 的理由

目的：

- Debug 錯誤建議
- 回顧 Monica 為什麼做出決策
- 分析不同 prompt version 的表現
- 支援 Performance Dashboard

### 15.4 Prompt Versioning

所有 prompts 都需要版本管理。

需要版本管理的 prompt：

- agent prompt
- skeptic prompt
- team leader prompt
- Monica prompt
- performance scorer prompt
- JSON repair prompt

每個 prompt version 需要記錄：

- prompt key
- version
- active status
- prompt content
- created_at
- changed_reason

規則：

- 每筆 agent run 必須記錄使用的 prompt version。
- 每筆 recommendation 必須能追蹤到 prompt version。
- 修改 prompt 後，不應覆蓋舊版本。
- Performance Dashboard 需要能比較不同 prompt version 的準確率。

### 15.5 Backtesting / Simulation Mode

未來加入 backtesting mode，用歷史資料測試 Monica 的決策品質。

用途：

- 模擬過去某一天 Monica 會如何分析
- 比較實際後續價格表現
- 調整 scoring 與 influence points
- 測試 prompt version 改動是否改善結果

Stage 1 可以先保留 schema 與設計，不一定第一天完成完整 backtesting。

Backtesting 注意事項：

- 不能使用測試日期之後的資料。
- 必須避免 look-ahead bias。
- 要清楚記錄使用的歷史資料版本。

### 15.6 Paper Trading Mode

系統需要支援 paper trading，用來追蹤 Monica 建議若被執行會有什麼結果。

Paper trading records：

- recommendation id
- simulated entry date
- simulated entry price
- simulated shares or position size
- target price
- stop loss
- current value
- realized / unrealized return
- status：open / target_hit / stop_loss_hit / closed / expired

目的：

- 不用真實下單，也能驗證 Monica 的建議品質
- 讓 Performance Dashboard 更有意義
- 區分「使用者實際投資」與「系統模擬建議」

### 15.7 Alert Rules

Stage 1 可以先做 dashboard alerts，之後再加 email / LINE / Telegram。

Alert 類型：

- 股票到達 Monica 建議買進區間
- 股票到達目標價
- 股票跌破停損點
- Mission 股票出現重大新聞
- 持股風險升高
- portfolio concentration 超過設定
- team / Monica confidence 大幅改變
- data source stale 或 fetch failed
- API rate limit 接近上限

Alert 狀態：

- new
- acknowledged
- resolved
- dismissed

### 15.8 User Feedback

使用者可以對 Monica 或 team 建議提供回饋。

Feedback 類型：

- useful
- not useful
- too aggressive
- too conservative
- wrong due to missing data
- I followed this
- I ignored this
- needs more explanation

用途：

- 幫助使用者回顧決策
- 未來可納入 scoring
- 協助調整 Monica prompt
- 找出資料缺口或 UI 說明不足

### 15.9 Explainability Rules

每個 recommendation 都必須可解釋。

必須包含：

- 為什麼買
- 為什麼不買
- 最大風險
- 什麼條件會改變決策
- 哪些 team 支持
- 哪些 team 反對
- Monica 為什麼接受或否決
- 資料品質是否足夠

不允許：

- 只說「建議買進」但沒有價格與理由
- 只給信心分數但沒有風險
- 只給結論但沒有 team disagreement

### 15.10 Failure Mode Rules

API failure：

- 重試一次。
- 仍失敗則使用 cached data。
- cached data 必須標記 stale 或 delayed。
- 若無 cached data，該資料標記 missing。

GPT / model call failure：

- 重試一次。
- 仍失敗則標記 agent run failed。
- Team leader 必須知道哪些 agent failed。
- Monica 必須降低信心或選擇 wait。

Invalid JSON：

- 嘗試 JSON repair 一次。
- repair 失敗則標記 failed。
- 不使用不可解析資料產生 recommendation。

Data conflict：

- 優先使用 primary source。
- 標記 conflicting。
- Monica confidence 上限為 60，除非人工確認。

Low confidence：

- 若 Monica confidence 低於 70，不產生 buy / small_buy action。
- 可以產生 watch / wait。

Insufficient data：

- 若關鍵資料不足，不允許高信心建議。
- 報告中必須說明缺少什麼資料。

### 15.11 Cost Control Posture

使用者預期每天最多執行 1 到 2 次完整分析，因此 GPT 成本可接受。

Stage 1 不需要過度壓低 GPT 使用量，但仍需避免浪費。

建議：

- Manual run 才執行完整五組團隊。
- Timer refresh 只更新資料，不一定每次都跑完整 AI 分析。
- Mission run 執行完整 mission analysis。
- 若資料沒有變化，可提示使用者是否仍要重新分析。
- 每次 run 記錄 model usage，方便未來估算成本。

### 15.12 Stage 1 Acceptance Criteria

Stage 1 完成標準：

- 可以建立 Supabase project 與 schema。
- 可以輸入與編輯 portfolio holdings。
- 可以輸入與編輯 watchlist。
- 可以顯示台股 / 美股市場摘要。
- 可以手動 refresh market data。
- 可以設定 timer refresh。
- 可以建立 Mission，例如「分析 Nvidia」。
- 五組 GPT team 可以產生 team reports。
- 每組 team report 都包含 Market Review、Portfolio Review、Mission Analysis、Market Scan。
- Monica 可以讀取五組 team reports 並產生 final decision。
- Monica decision 包含 buy/wait/hold/reduce/sell/avoid、買進區間、目標價、停損點、信心分數與理由。
- Recommendations 可以寫入 Supabase。
- Performance Dashboard 可以顯示 team、Monica、recommendation history 的初始資料。
- Influence points 有初始分數並能根據 outcome 更新。
- UI 使用繁體中文。
- Dashboard 在 desktop 與 mobile 都可讀。
- Playwright / Browser 視覺檢查通過。
- 資料 stale / missing / failed fetch 有明確狀態。
- Agent / team / Monica output 皆有 JSON validation。
