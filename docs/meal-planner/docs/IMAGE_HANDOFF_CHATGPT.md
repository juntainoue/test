# 料理写真の制作 引き継ぎ書（ChatGPT向け）

作成日: 2026-11-11 ／ 対象: 全60品（写真がない40品を優先、既存20品は作り直し推奨） ／ 依頼元: ごはん計画（`juntainoue/test` の `docs/meal-planner/`）

## 1. お願いしたいこと

献立アプリ「ごはん計画」で、利用者が**写真を見て料理を選べる**ようにします。**副菜を添えてお盆に載せた、彩りのある定食風**の料理写真（AI生成）を、1品1枚ずつ作ってください。

- **A. 写真がない40品**を先に作ってください（優先）。
- **B. 写真がある20品**は白い皿1枚の写真なので、雰囲気をそろえるため同じ形式で作り直すことを推奨します。作り直すまでは今の写真を表示します。
- 1回の依頼で1品だけ作る（複数の料理を1枚にまとめない）
- 下の「共通の指示」と、各料理の「料理の指示」（主菜＋副菜）をつなげて、そのまま ChatGPT に貼り付ける
- 料理名・主な材料と見た目が一致しない画像は作り直す

## 2. 共通の指示（すべての料理で先頭に付ける）

```
Square 1:1 photorealistic food photograph for a recipe app. A Japanese-style set meal for one person arranged on a light natural wood tray, placed on a warm ivory tabletop. Soft natural window light from the upper left, 45-degree overhead angle, the whole tray visible. The main dish is on the largest plate or bowl in the front center and is clearly the focus; side dishes are smaller and simple. Fresh, colorful and appetizing, with natural greens, reds and yellows. White and light-colored ceramic tableware. No text, no letters, no logos, no watermark, no people or hands, no product packaging.
```

主菜は手前中央のいちばん大きな器に置き、ひと目で何の料理かわかるようにします。副菜は小さく簡単なもの（ご飯・汁物・青菜・サラダなど）で、ジャンルと主菜に合わせて表の指示に書いてあります。ご飯や汁物が主菜に含まれる料理（丼・カレー・麺・スープなど）には重ねて付けません。

**副菜は盛り付けの雰囲気を伝えるための飾りです。** レシピ・買い物リスト・栄養値には含めず、アプリでもその旨を表示します。

## 3. 納品の形式

| 項目 | 指定 |
| --- | --- |
| 縦横比 | 正方形（1:1） |
| 大きさ | 1024×1024 ピクセル以上（PNGまたはJPEG） |
| ファイル名 | 下の表の **ID** ＋拡張子（例：`tamagoyaki.png`） |
| 1料理あたり | 採用する1枚だけ |
| 一緒に記録するもの | 指示文を変更した場合はその内容と、作成日。表の「指示文を変えた」「作成日」欄に記入 |

WebPへの変換（640px・320px）、アプリへの登録、表示確認は開発側（Claude Code）で行います。受け取った画像はこのチャットに添付するか、まとめてZIPで渡してください。

## 4. 確認してから採用する項目（1枚ごと）

- [ ] 料理名どおりの料理に見える（別の料理に見えない）
- [ ] 主菜が手前中央でいちばん目立ち、表の「主な材料」が見えている
- [ ] 副菜は表の指示どおりの小さなものだけで、主菜より目立っていない
- [ ] 全体が明るく、緑・赤・黄などの彩りがある
- [ ] スマホの小さな表示（約3cm角）でも主菜が何かわかる
- [ ] 肉・魚・卵が生焼けに見えない（かつおのたたきは中が赤くてよい）
- [ ] 文字・ロゴ・透かし・人物・手・商品パッケージが写っていない
- [ ] 正方形で、お盆全体が切れずに写っている
- [ ] ほかの料理の写真と並べたとき、光・お盆・器の雰囲気がそろっている

## 5. 権利と注意

- **自分の ChatGPT アカウントで、文章の指示から新しく生成した画像だけ**を使います。インターネット上の料理写真や他人の写真を参考画像としてアップロードしないでください。
- 既存20品は、OpenAI の利用規約「Ownership of content」（利用者が生成物を所有できる旨）を利用根拠として記録しています（2026-11-11 確認）。お使いのプランの規約で商用利用が認められていることを、念のため確認してください。
- 実在の店舗名・商品名・ブランドを指示文に入れないでください。
- 画像はアプリ上で「AI生成の盛り付けイメージ（副菜は献立に含みません）」と表示します。分量や栄養の根拠にはしません。

## 6. 料理ごとの指示

材料はアプリに登録されている1人分のレシピから、調味料を除いて記載しています（副菜の材料は含みません）。

### A. 写真がない40品（優先）

| # | ID（ファイル名） | 料理名 | ジャンル | 主な材料 | 料理の指示（共通の指示の後ろに付ける） | 指示文を変えた | 作成日 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `tamagoyaki` | ほうれん草入り卵焼き | 和食 | 卵・ほうれん草・牛乳 | Main dish: Japanese rolled omelet (tamagoyaki) with chopped green spinach visible inside, cut into thick slices showing the yellow and green spiral. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 2 | `chikuzen` | 筑前煮 | 和食 | 鶏もも肉・れんこん・にんじん・ごぼう | Main dish: Japanese chikuzenni simmered dish: chicken thigh chunks, lotus root slices, carrot and burdock root pieces cut irregularly, glossy light soy glaze, in a white ceramic bowl. No green beans, no konjac in the main dish. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 3 | `saba_shio` | さばの塩焼き | 和食 | さば・大根 | Main dish: Japanese salt-grilled mackerel fillet with crisp blistered silver blue skin, a small mound of grated daikon radish beside it. No lemon in the main dish. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 4 | `udon` | 鶏ときのこの温うどん | 和食 | うどん・鶏むね肉・しめじ・長ねぎ | Main dish: Japanese hot udon noodle soup in a white ceramic bowl: thick white udon in clear light brown dashi broth, sliced cooked chicken breast, shimeji mushrooms and sliced green onion. No egg, no tempura in the main dish. Side dishes around it: a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 5 | `katsuo` | かつおのたたき香味だれ | 和食 | かつおたたき・玉ねぎ・大葉・しょうが | Main dish: Japanese seared bonito tataki: slices with seared grey edges and deep red centers, topped with thin sliced onion, shredded green shiso leaves and grated ginger, light ponzu sauce. No garlic chips in the main dish. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 6 | `nabe` | 白菜と豚肉の重ね蒸し | 和食 | 白菜・豚バラ肉 | Main dish: Japanese steamed layers of napa cabbage and thin pork belly slices in a shallow pan or white dish, soft translucent cabbage, cooked pale pork, small dish of ponzu beside it. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 7 | `tofu_hamburg` | 豆腐入り鶏ハンバーグ | 和食 | 鶏ひき肉・木綿豆腐・玉ねぎ | Main dish: Japanese chicken and tofu hamburg steak: two pale golden oval patties with glossy soy glaze. No tomato sauce in the main dish. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 8 | `tuna_pasta` | ツナとトマトのパスタ | 洋食 | パスタ・ツナ缶・トマト缶・にんにく | Main dish: Spaghetti with tuna and tomato sauce: red tomato sauce with flakes of canned tuna and a little garlic, twirled on a white plate. No basil leaves, no cheese in the main dish. Side dishes around it: a small green salad with cherry tomatoes and a small cup of clear golden consomme soup. |  |  |
| 9 | `bolognese` | ミートソーススパゲティ | 洋食 | パスタ・合いびき肉・トマト缶・玉ねぎ | Main dish: Spaghetti with Japanese-style meat sauce: thick red-brown ground meat and tomato sauce with onion on top of spaghetti. No cheese in the main dish. Side dishes around it: a small green salad with cherry tomatoes and a small cup of clear golden consomme soup. |  |  |
| 10 | `carbonara` | カルボナーラ | 洋食 | パスタ・卵・ベーコン・粉チーズ | Main dish: Spaghetti carbonara: creamy pale yellow egg and grated cheese sauce, crisp bacon pieces, coarse black pepper. No cream puddle, no parsley in the main dish. Side dishes around it: a small green salad with cherry tomatoes and a small cup of clear golden consomme soup. |  |  |
| 11 | `omelet` | きのこのチーズオムレツ | 洋食 | 卵・しめじ・チーズ・牛乳・バター | Main dish: Folded yellow omelet with melted cheese and shimeji mushrooms visible at the opening. No ketchup in the main dish. Side dishes around it: a small plate of white rice, a small green salad with cherry tomatoes, and a small cup of clear golden consomme soup. |  |  |
| 12 | `chicken_tomato` | 鶏肉のトマト煮 | 洋食 | 鶏むね肉・トマト缶・玉ねぎ・にんにく | Main dish: Chicken breast pieces simmered in chunky red tomato sauce with soft onions and garlic, in a white shallow bowl. Side dishes around it: a small plate of white rice, a small green salad with cherry tomatoes, and a small cup of clear golden consomme soup. |  |  |
| 13 | `gratin` | 鶏とブロッコリーのグラタン | 洋食 | 鶏もも肉・ブロッコリー・牛乳・チーズ・バター | Main dish: Chicken and broccoli gratin in a white oval baking dish: golden browned melted cheese on top, creamy white sauce, green broccoli florets and chicken pieces visible. No macaroni in the main dish. Side dishes around it: a small plate of white rice, a small green salad with cherry tomatoes, and a small cup of clear golden consomme soup. |  |  |
| 14 | `salmon_muniere` | 鮭のムニエル | 洋食 | 生鮭・バター・レモン | Main dish: Salmon meuniere: one pan-fried salmon fillet with golden floured crust and brown butter, a lemon wedge on the side. Side dishes around it: a small plate of white rice, a small green salad with cherry tomatoes, and a small cup of clear golden consomme soup. |  |  |
| 15 | `chicken_soup` | 鶏むね肉と豆のスープ | 洋食 | 鶏むね肉・ミックスビーンズ・キャベツ | Main dish: Chicken breast and bean soup in a white ceramic bowl: clear golden consomme broth, diced chicken, mixed beans (kidney, chickpeas, green peas) and cabbage pieces. Side dishes around it: a small green salad with cherry tomatoes and a small bread roll. |  |  |
| 16 | `keema` | キーマカレー | 洋食 | 鶏ひき肉・玉ねぎ・トマト・米 | Main dish: Japanese keema curry: dry minced chicken curry with diced onion and tomato beside white rice on the same white plate. No egg, no raisins in the main dish. Side dishes around it: a small green salad with cherry tomatoes and a small cup of clear golden consomme soup. |  |  |
| 17 | `chicken_herb` | チキンのハーブ焼き | 洋食 | 鶏むね肉・じゃがいも | Main dish: Herb roasted chicken breast, sliced, golden seared surface with dried herbs, with round slices of pan-fried skin-on potato. Side dishes around it: a small plate of white rice, a small green salad with cherry tomatoes, and a small cup of clear golden consomme soup. |  |  |
| 18 | `risotto` | きのことチーズのリゾット | 洋食 | 米・しめじ・チーズ | Main dish: Mushroom and cheese risotto in a white shallow bowl: creamy rice with shimeji mushrooms and melted cheese. No parsley, no meat in the main dish. Side dishes around it: a small green salad with cherry tomatoes and a small cup of clear golden consomme soup. |  |  |
| 19 | `pork_piccata` | 豚肉のピカタ | 洋食 | 豚ロース肉・卵・粉チーズ | Main dish: Pork piccata: pork loin slices coated in a golden cheese-and-egg crust, pan-fried. No sauce in the main dish. Side dishes around it: a small plate of white rice, a small green salad with cherry tomatoes, and a small cup of clear golden consomme soup. |  |  |
| 20 | `shrimp_garlic` | えびのガーリックソテー | 洋食 | むきえび・にんにく・ブロッコリー | Main dish: Garlic sauteed peeled shrimp with green broccoli florets and golden garlic slices, glossy olive oil. Side dishes around it: a small plate of white rice, a small green salad with cherry tomatoes, and a small cup of clear golden consomme soup. |  |  |
| 21 | `shakshuka` | トマトと卵の煮込み | 洋食 | 卵・トマト缶・玉ねぎ・パプリカ | Main dish: Two eggs poached in chunky red tomato sauce with soft onions and red bell pepper strips, in a small white skillet-shaped dish; egg whites fully set. Side dishes around it: a small plate of white rice, a small green salad with cherry tomatoes, and a small cup of clear golden consomme soup. |  |  |
| 22 | `mapo_nasu` | 麻婆なす | 中華 | なす・豚ひき肉 | Main dish: Chinese mapo eggplant: soft purple-skinned eggplant pieces with ground pork in glossy reddish brown spicy sauce. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 23 | `ebichili` | エビチリ | 中華 | むきえび・長ねぎ・にんにく・しょうが | Main dish: Chinese chili shrimp (ebi chili): plump shrimp coated in glossy orange-red sweet chili sauce with chopped green onion. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 24 | `chicken_cashew` | 鶏肉とカシューナッツ炒め | 中華 | 鶏もも肉・ピーマン | Main dish: Chinese stir fried chicken thigh pieces with whole cashew nuts and green bell pepper squares in light glossy brown sauce. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 25 | `hoikoro` | 回鍋肉 | 中華 | 豚バラ肉・キャベツ・ピーマン | Main dish: Chinese twice-cooked pork (hoikoro): pork belly slices with large cabbage pieces and green bell pepper in glossy dark miso-colored sauce. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 26 | `banbanji` | 棒棒鶏 | 中華 | 鶏むね肉・きゅうり | Main dish: Chinese bang bang chicken: shredded steamed chicken breast over julienned cucumber, topped with creamy beige sesame sauce. No tomato in the main dish. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of bean sprout and carrot salad. |  |  |
| 27 | `gyoza` | 焼き餃子 | 中華 | 餃子の皮・豚ひき肉・キャベツ・ニラ | Main dish: Japanese pan-fried gyoza dumplings: a row of dumplings with crisp golden brown bottoms facing up, on a white plate. No dipping sauce bowl with chili oil in the main dish. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 28 | `chahan` | えびと卵のチャーハン | 中華 | 米・むきえび・卵・長ねぎ | Main dish: Chinese fried rice with small shrimp, scrambled egg and chopped green onion, loosely mounded on a white plate. No peas, no carrots in the main dish. Side dishes around it: a small cup of egg drop soup with green onion and a small dish of cucumber and carrot salad. |  |  |
| 29 | `tantan` | 豆乳担々麺 | 中華 | 中華麺・豚ひき肉・豆乳 | Main dish: Soy milk tantanmen ramen in a white bowl: creamy pale orange sesame soy milk broth, ramen noodles, spicy ground pork on top, a little chili oil. No bok choy, no egg in the main dish. Side dishes around it: a small dish of cucumber and carrot salad. |  |  |
| 30 | `harusame` | 鶏と春雨の中華スープ | 中華 | 鶏むね肉・春雨・白菜 | Main dish: Chinese chicken and glass noodle soup in a white bowl: clear broth, translucent glass noodles, shredded chicken breast and napa cabbage. No egg in the main dish. Side dishes around it: a small bowl of white rice and a small dish of cucumber and carrot salad. |  |  |
| 31 | `blackpepper` | 牛肉の黒胡椒炒め | 中華 | 牛こま肉・玉ねぎ・パプリカ | Main dish: Chinese black pepper beef stir fry: thin beef slices with onion wedges and red and yellow bell pepper strips, visible coarse black pepper. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 32 | `chicken_lemon` | 鶏肉のレモン炒め | 中華 | 鶏むね肉・パプリカ・レモン | Main dish: Chinese lemon chicken stir fry: chicken breast pieces in light glossy lemon sauce with red and yellow bell pepper, thin lemon slice. No deep-fried batter in the main dish. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 33 | `mapo_harusame` | 麻婆春雨 | 中華 | 春雨・豚ひき肉・長ねぎ | Main dish: Chinese mapo glass noodles (mabo harusame): translucent glass noodles with ground pork and chopped green onion in reddish brown savory sauce. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 34 | `garlic_pork` | にんにく香る豚ニラ炒め | 中華 | 豚こま肉・ニラ・もやし・にんにく | Main dish: Stir fried pork with garlic chives (nira) and bean sprouts, thin pork slices, garlic slices, glossy light sauce. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 35 | `shumai` | 簡単シュウマイ | 中華 | 豚ひき肉・シュウマイの皮・玉ねぎ・しょうが | Main dish: Japanese homemade pork shumai dumplings: eight open-top steamed dumplings with visible pork filling, on a white plate. No green peas on top, no bamboo steamer basket text in the main dish. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 36 | `spicy_chicken` | よだれ鶏 | 中華 | 鶏むね肉・きゅうり | Main dish: Chinese mouthwatering chicken (yodare-dori): sliced steamed chicken breast over cucumber strips, drizzled with red chili oil and dark soy sauce. No peanuts, no cilantro in the main dish. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of bean sprout and carrot salad. |  |  |
| 37 | `pork_egg` | 豚肉と卵のオイスター炒め | 中華 | 豚こま肉・卵・小松菜 | Main dish: Chinese oyster sauce stir fry of thin pork slices, fluffy scrambled egg and green komatsuna greens. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 38 | `chicken_rice` | 海南鶏飯風チキンライス | 中華 | 鶏もも肉・米・しょうが・きゅうり | Main dish: Hainanese-style chicken rice: sliced poached chicken thigh with glossy skin on top of pale yellowish chicken-broth rice, cucumber slices on the side, small dish of ginger soy sauce. Side dishes around it: a small cup of egg drop soup with green onion and a small dish of bean sprout and carrot salad. |  |  |
| 39 | `beef_tofu` | 牛肉と厚揚げの甘辛煮 | 和食 | 牛こま肉・厚揚げ・長ねぎ | Main dish: Japanese simmered beef and atsuage (thick fried tofu) in sweet soy sauce: golden brown tofu blocks, thin beef slices and diagonal cut long onion, in a white bowl. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 40 | `chicken_miso` | 鶏むね肉の味噌マヨ焼き | 和食 | 鶏むね肉・キャベツ | Main dish: Japanese chicken breast slices baked with miso mayonnaise topping, golden browned on top, with a mound of shredded raw cabbage beside. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |

### B. 写真がある20品（作り直し推奨）

| # | ID（ファイル名） | 料理名 | ジャンル | 主な材料 | 料理の指示（共通の指示の後ろに付ける） | 指示文を変えた | 作成日 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 41 | `mapo` | 四川風麻婆豆腐 | 中華 | 豆腐・豚ひき肉・長ねぎ・にんにく・しょうが | Main dish: Sichuan mapo tofu with ground pork, chili bean sauce and scallions Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 42 | `ginger` | 豚の生姜焼き | 和食 | 豚こま肉・玉ねぎ・しょうが | Main dish: Japanese pork ginger stir fry, thin irregular pork slices with translucent sliced onions in glossy soy ginger sauce. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 43 | `chicken` | 鶏の照り焼き | 和食 | 鶏もも肉・レタス | Main dish: Japanese chicken teriyaki, sliced cooked skin-on chicken thigh with glossy caramel soy glaze, a few lettuce leaves at the side. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 44 | `pasta` | きのこクリームパスタ | 洋食 | パスタ・しめじ・ベーコン・牛乳・バター | Main dish: Japanese creamy shimeji mushroom and bacon spaghetti, pale milk cream sauce, visible shimeji mushrooms and small bacon pieces. Side dishes around it: a small green salad with cherry tomatoes and a small cup of clear golden consomme soup. |  |  |
| 45 | `salmon` | 鮭のホイル焼き | 和食 | 生鮭・えのき・玉ねぎ・バター | Main dish: Japanese salmon baked in an opened foil parcel, one cooked salmon fillet over thin sliced onions with enoki mushrooms and a little melted butter. Foil sits on the white plate. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 46 | `curry` | チキンカレー | 洋食 | 鶏もも肉・玉ねぎ・にんじん・じゃがいも・米 | Main dish: Japanese chicken curry rice, thick brown mild curry with chicken, potato chunks, carrots and onions beside white rice on same white plate. Side dishes around it: a small green salad with cherry tomatoes and a small cup of clear golden consomme soup. |  |  |
| 47 | `chili` | 豚キムチ炒め | 中華 | 豚こま肉・キムチ・ニラ | Main dish: Japanese pork kimchi stir fry, thin pork slices and napa cabbage kimchi with green garlic chives. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 48 | `hamburg` | 煮込みハンバーグ | 洋食 | 合いびき肉・玉ねぎ・卵・パン粉・トマト缶 | Main dish: Japanese simmered hamburg steak: one oval ground beef/pork patty simmered in red chunky tomato sauce with softened onions. Side dishes around it: a small plate of white rice, a small green salad with cherry tomatoes, and a small cup of clear golden consomme soup. |  |  |
| 49 | `oyako` | 親子丼 | 和食 | 鶏もも肉・卵・玉ねぎ・米 | Main dish: Japanese oyakodon rice bowl: cooked chicken thigh pieces and translucent onion bound in softly set but cooked yellow egg, over white rice. Side dishes around it: a bowl of miso soup and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 50 | `pepper` | 青椒肉絲 | 中華 | 牛こま肉・ピーマン・たけのこ水煮 | Main dish: Chinese qingjiao rousi, stir fried thin strips of beef, green bell pepper and pale bamboo shoots with light glossy brown sauce. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 51 | `tomato` | トマトと卵の中華炒め | 中華 | トマト・卵・長ねぎ | Main dish: Chinese stir fried tomato and egg, large juicy red tomato wedges, fluffy cooked yellow scrambled egg, a little chopped scallion. Side dishes around it: a small bowl of white rice, a small cup of egg drop soup with green onion, and a small dish of cucumber and carrot salad. |  |  |
| 52 | `stew` | 鶏と野菜のポトフ | 洋食 | 鶏もも肉・キャベツ・にんじん・じゃがいも | Main dish: Japanese chicken and vegetable pot-au-feu, clear pale broth with cooked chicken thigh chunks, cabbage, carrots and potatoes. No sausage in the main dish. Side dishes around it: a small green salad with cherry tomatoes and a small bread roll. |  |  |
| 53 | `saba_miso` | さばの味噌煮 | 和食 | さば・しょうが | Main dish: Japanese saba misoni, two mackerel fillet pieces with recognizable silver blue patterned skin, simmered in thick light brown miso sauce with ginger slivers. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 54 | `buri` | ぶりの照り焼き | 和食 | ぶり | Main dish: Japanese buri teriyaki: one thick cooked yellowtail fish fillet, recognizable grey edge skin, glazed with glossy amber soy mirin sauce. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 55 | `nikujaga` | 肉じゃが | 和食 | 牛こま肉・じゃがいも・玉ねぎ・にんじん | Main dish: Japanese nikujaga, thin beef slices, large potato pieces, carrots and translucent onions in a small amount of light soy broth. No green beans in the main dish. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 56 | `tonjiru` | 具だくさん豚汁 | 和食 | 豚こま肉・大根・にんじん・ごぼう・豆腐 | Main dish: Japanese tonjiru miso soup in ivory ceramic bowl, thin pork pieces, daikon radish, carrot half moons, burdock and tofu cubes in cloudy tan miso broth. Side dishes around it: a small bowl of white rice and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 57 | `soboro` | 鶏そぼろ丼 | 和食 | 鶏ひき肉・卵・米 | Main dish: Japanese chicken soboro don: white rice bowl topped with two distinct halves of finely crumbled cooked soy chicken mince and fluffy yellow scrambled egg. Side dishes around it: a bowl of miso soup and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 58 | `shogayaki_chicken` | 鶏むね肉の生姜焼き | 和食 | 鶏むね肉・玉ねぎ・しょうが | Main dish: Japanese chicken breast ginger stir fry, lean skinless chicken breast slices with sliced onions in glossy light brown soy ginger sauce. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 59 | `tofu_steak` | 豆腐ステーキきのこあん | 和食 | 木綿豆腐・しめじ | Main dish: Japanese tofu steak with mushroom sauce: two golden pan-seared rectangular firm tofu slabs under glossy light soy gravy with shimeji mushrooms. No meat in the main dish. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |
| 60 | `sukiyaki` | 牛肉と豆腐のすき煮 | 和食 | 牛こま肉・豆腐・長ねぎ・白菜 | Main dish: Japanese beef and tofu suki-ni, thin cooked beef slices, white tofu blocks, diagonal cut long onion and softened napa cabbage, shallow brown soy broth in white ceramic bowl. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon. |  |  |

## 7. 貼り付け例（1品目）

```
Square 1:1 photorealistic food photograph for a recipe app. A Japanese-style set meal for one person arranged on a light natural wood tray, placed on a warm ivory tabletop. Soft natural window light from the upper left, 45-degree overhead angle, the whole tray visible. The main dish is on the largest plate or bowl in the front center and is clearly the focus; side dishes are smaller and simple. Fresh, colorful and appetizing, with natural greens, reds and yellows. White and light-colored ceramic tableware. No text, no letters, no logos, no watermark, no people or hands, no product packaging. Main dish: Japanese rolled omelet (tamagoyaki) with chopped green spinach visible inside, cut into thick slices showing the yellow and green spiral. Side dishes around it: a small bowl of white rice, a bowl of miso soup, and a small dish of blanched green spinach (ohitashi) with a few slices of yellow pickled daikon.
```

## 8. 開発側（Claude Code）が受け取った後に行うこと

1. 画像と料理の一致、上の確認項目を再確認（合わない場合は作り直しを依頼）
2. 主菜が小さな表示でも判別できるかを確認し、640×640 と 320×320 の WebP に変換（`assets/images/{ID}.webp`、`{ID}-320.webp`）
3. `data/recipes.json` の `image` を `ready` にし、`data/image-manifest.json` に生成元・指示文・元ファイルの識別情報（SHA-256）・確認日を記録
4. 写真の説明表示を「AI生成の盛り付けイメージ（副菜は献立に含みません）」にする
5. 自動テストと画面での表示確認、公開前の承認
