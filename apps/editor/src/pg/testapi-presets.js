// 試験の再現（プリセット Q/R・runStep）
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- 試験の再現（Q1〜Q8・R1〜R9 の並び。runPreset は実操作に近い形で流す）----
function presets() {
  return {
    Q1: [{ act: "move", id: "F_h0", by: [12, 8] }, { act: "editAppend", id: "F_b0", add: S1_ADD }],
    Q2: [{ act: "moveToBelow", id: "F_b0", target: "F_p0", gap: 24, alignLeft: "F_p0" }, { act: "edit", id: "F_h0", text: S2_HEAD }],
    Q3: [{ act: "moveGroupBelow", ids: ["F_h0", "F_b0"], target: "F_p0", gap: 24, alignLeft: "F_p0" }, { act: "edit", id: "F_h0", text: S2_HEAD }],
    Q4: [{ act: "editAppend", id: "F_b0", add: S1_ADD }],
    Q5: [{ act: "editAppend", id: "F_b0", add: "季節の意匠。" }],
    Q6: [{ act: "addBelow", marker: "I_divider", gap: 24, text: "季節により品が替わります" }, { act: "moveAddedBelowSection", extra: 80 }],
    Q7: [{ act: "move", id: "F_h0", by: [12, 8] }],
    Q8: [{ act: "move", id: "F_h0", by: [12, 8] }],
    // R1：区切り線を下へ30（M1）
    R1: [{ act: "move", id: "I_divider", by: [0, 30] }],
    // R2（改）：区切り線を甘味処の見出しの下端＋1（縦の中心をそこへ）→ 並び替え（見出し→区切り線→営業時間）
    R2: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_kanmi", edge: "bottom", off: 1 }],
    // R3：繰り返す部品を中に持つ子（品の並び）の中へ落として M2（付いていく先が card_ でないことを見る）
    R3: [{ act: "moveToCardDesc", id: "I_divider", cardIndex: 1 }],
    // R4：特集1の見出しを Cmd+C → Cmd+V
    R4: [{ act: "copyPaste", id: "F_h0" }],
    // R5：特集1の写真を Cmd+D
    R5: [{ act: "dup", id: "F_p0" }],
    // R6：本文を写真と見出しの間へ（SP の並び替え）
    R6: [{ act: "reorderBetween", id: "F_b0", after: "F_p0", before: "F_h0" }],
    // R7：本文を見出しより上へ（PC の文字の塊の並び替え）
    R7: [{ act: "reorderBefore", id: "F_b0", before: "F_h0" }],
    // R8：見出しを同じ塊の中で右30・下20（M1・並び替えにならない）
    R8: [{ act: "move", id: "F_h0", by: [30, 20] }],
    // R9：表が2行なので先に1行複製して3行にしてから、区切り線の下に文字を足し、表の2行目と3行目の間の高さへ→ 表を1行減らす（§2.4）
    R9: [{ act: "dupRow", rowIndex: 1 }, { act: "addBelow", marker: "I_divider", gap: 24, text: "季節により品が替わります" }, { act: "moveAddedToRowGap", afterRow: 1 }, { act: "delRow", rowIndex: 1 }],
    // T1：区切り線を甘味処の見出しと営業時間の間へ（並び替え）
    T1: [{ act: "reorderBetween", id: "I_divider", after: "I_kanmi", before: "I_time" }],
    // T2（改）：区切り線の上端を表の下端＋40 へ → 並び替え（表→区切り線→ボタン）。§3で並び替えの相手が全直接子になった
    T2: [{ act: "moveToRef", id: "I_divider", ref: "I_table", edge: "bottom", off: 40 }],
    // T3：区切り線の上端を表の上端＋60（表の中）へ → M2（付いていく先=表）
    T3: [{ act: "moveToRef", id: "I_divider", ref: "I_table", edge: "top", off: 60 }],
    // T4：特集1の本文を写真の下端から24下へ（上向きでない M2・Q2 と同じ）
    T4: [{ act: "moveToBelow", id: "F_b0", target: "F_p0", gap: 24, alignLeft: "F_p0" }],
    // T5：特集1の見出しを Cmd+C → Cmd+V（SP 幅は verify で確認）
    T5: [{ act: "copyPaste", id: "F_h0" }],
    // V1：区切り線を表の中（上端＋60、縦の中心）へ → M2（代表。verify は区切り線・見出し・営業時間の3つを1つずつ）
    V1: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_table", edge: "top", off: 60 }],
    // W1：特集1の見出しを右30下20（R8 と同じ・本文と重なる＝自分で重ねた）
    W1: [{ act: "move", id: "F_h0", by: [30, 20] }],
    // W2：甘味処の見出しを縦中心が表の上端＋60 へ（V1 と同じ・M2）
    W2: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }],
    // W3：W2 のあと見出しを「背面へ」→「前面へ」
    W3: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }, { act: "select", id: "I_kanmi" }, { act: "zback" }, { act: "zfront" }],
    // W4：W2・W3 のあとそのセクションを元に戻す
    W4: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }, { act: "select", id: "I_kanmi" }, { act: "zback" }, { act: "resetSection", sec: "items" }],
    // W5：W1 のあと本文に書き足す
    W5: [{ act: "move", id: "F_h0", by: [30, 20] }, { act: "editAppend", id: "F_b0", add: S1_ADD }],
    // W6：表を縦中心が甘味処見出しの縦中心より10上へ（並び替え）
    W6: [{ act: "moveCenterToCenter", id: "I_table", ref: "I_kanmi", off: -10 }],
    // W7：ボタンを営業時間と表の隙間の真ん中へ（並び替え）
    W7: [{ act: "moveCenterToGap", id: "I_pillbg", after: "I_time", before: "I_table" }],
    // W8：品の並びを営業時間と表の隙間の真ん中へ（並び替え）
    W8: [{ act: "moveCenterToGap", id: "I_cards", after: "I_time", before: "I_table" }],
    // W9：表を下へ10（M1）
    W9: [{ act: "move", id: "I_table", by: [0, 10] }],
    // W10：表（1回目で全体が選ばれる）＝代表として表全体を選ぶ
    W10: [{ act: "select", id: "I_table" }],
    // W11：部品を選ぶ（本文）＝操作ボタンの位置確認の代表
    W11: [{ act: "select", id: "F_b0" }],
    // ===== 試験台8 Y1〜Y14（大きさ・選んでからのドラッグ）=====
    // Y1：表全体を選んでから下へ20（選んでからのドラッグ＝全体が M1 で動く）
    Y1: [{ act: "select", id: "I_table" }, { act: "move", id: "I_table", by: [0, 20] }],
    // Y2：Y1 のあと行の文字を選ぶ（中の1件）
    Y2: [{ act: "select", id: "I_table" }, { act: "move", id: "I_table", by: [0, 20] }, { act: "selectRow", index: 0 }],
    // Y3：営業時間の右の辺で幅を200へ
    Y3: [{ act: "resizeTo", id: "I_time", handle: "e", w: 200 }],
    // Y4：特集1の本文の左の辺を右へ100（幅100減・右端固定）
    Y4: [{ act: "resize", id: "F_b0", handle: "w", by: [100, 0] }],
    // Y5：特集1の本文の下の辺を下へ40（padB 40）
    Y5: [{ act: "resize", id: "F_b0", handle: "s", by: [0, 40] }],
    // Y6：Y5 のあと下の辺を上へ100（文字の高さで止まる＝padB 0）
    Y6: [{ act: "resize", id: "F_b0", handle: "s", by: [0, 40] }, { act: "resize", id: "F_b0", handle: "s", by: [0, -100] }],
    // Y7：特集1の写真の右下の角を左上へ100・100（比を保って縮む）
    Y7: [{ act: "resize", id: "F_p0", handle: "se", by: [-100, -100] }],
    // Y8：区切り線の右の辺を左へ200・ボタンの右の辺を右へ100
    Y8: [{ act: "resize", id: "I_divider", handle: "e", by: [-200, 0] }, { act: "resize", id: "I_pillbg", handle: "e", by: [100, 0] }],
    // Y9：本文の右の辺を中身の右端より200右まで（端で止まる）
    Y9: [{ act: "resize", id: "F_b0", handle: "e", by: [2000, 0] }],
    // Y10：PC で Y3（端末またぎは verify で確認）
    Y10: [{ act: "resizeTo", id: "I_time", handle: "e", w: 200 }],
    // Y11：Y4 のあと 戻す→やり直す→元の位置に戻す
    Y11: [{ act: "resize", id: "F_b0", handle: "w", by: [100, 0] }, { act: "undo" }, { act: "redo" }, { act: "resetPart", id: "F_b0" }],
    // Y12：甘味処の見出しを表の上端＋60（縦中心）へ→その右の辺を右へ100
    Y12: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }, { act: "resize", id: "I_kanmi", handle: "e", by: [100, 0] }],
    // Y13：Y4 のあと本文の最後に書き足す（幅はそのまま・高さが伸びる）
    Y13: [{ act: "resize", id: "F_b0", handle: "w", by: [100, 0] }, { act: "editAppend", id: "F_b0", add: S1_ADD }],
    // Y14：区切り線を品の並びの上端−20（縦中心）へ＝区切り線を一番上に（並び替え）
    Y14: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_cards", edge: "top", off: -20 }],
    // ===== 試験台9 Z1〜Z7（そろえる・目安の線）=====
    // Z1：見出しを右30→左端が本文の左端+3 へ（吸い付いて本文の左端にそろう）
    Z1: [{ act: "move", id: "F_h0", by: [30, 0] }, { act: "snapAlignLeft", id: "F_h0", ref: "F_b0", off: 3 }],
    // Z2：Z1 の2回目を Alt ありで（吸い付かない＝+3 のまま）
    Z2: [{ act: "move", id: "F_h0", by: [30, 0] }, { act: "snapAlignLeft", id: "F_h0", ref: "F_b0", off: 3, alt: true }],
    // Z3：甘味処見出しを右へ（PC50/SP20）→横の真ん中が中身の真ん中+3 へ（@content の真ん中にそろう）
    Z3: [{ act: "moveDev", id: "I_kanmi", pc: [50, 0], sp: [20, 0] }, { act: "snapAlignCenterContent", id: "I_kanmi", off: 3 }],
    // Z4：本文の右の辺を、見出しの右端+3 へ（見出しの右端にそろう）
    Z4: [{ act: "snapResizeRight", id: "F_b0", ref: "F_h0", off: 3 }],
    // Z5：見出しを矢印キーの右で3回（吸い付かない）
    Z5: [{ act: "arrow", id: "F_h0", dir: "right", times: 3 }],
    // Z6：区切り線を R2 と同じ所へ（甘味処見出しの下端+1・縦中心）＝並び替え
    Z6: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_kanmi", edge: "bottom", off: 1, snap: true }],
    // Z7：本文の右の辺を写真に重なるまで（Y9 と同じ）＝ownerOverlaps
    Z7: [{ act: "resize", id: "F_b0", handle: "e", by: [2000, 0] }],
    // ===== 試験台10 P1〜P16（写真の差し替え・見せる範囲）。画像はプリセットの中で作る（四分割＝4章）=====
    P1: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }],
    P2: [{ act: "replaceQuad", id: "F_p0", name: "tall.jpg", w: 600, h: 1600 }],
    P3: [{ act: "replaceQuad", id: "F_p1", name: "wide.jpg", w: 1600, h: 600 }],
    P4: [{ act: "replaceQuad", id: "F_p0", name: "small.png", w: 300, h: 200, type: "image/png" }],
    P5: [{ act: "clearPhoto", id: "F_p0" }, { act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }],
    P6: [{ act: "replaceQuadCard", cardId: "c_warabi", name: "tall.jpg", w: 600, h: 1600 }],
    P7: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPan", id: "F_p0", by: [100, 0] }],
    P8: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropZoom", id: "F_p0", zoom: 2 }],
    P9: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPan", id: "F_p0", by: [5000, 0] }],
    P10: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPanCancel", id: "F_p0", by: [100, 0] }],
    P11: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPan", id: "F_p0", by: [100, 0] }],
    P12: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPan", id: "F_p0", by: [100, 0] }, { act: "undo" }, { act: "undo" }, { act: "redo" }, { act: "redo" }],
    P13: [{ act: "replaceQuad", id: "F_p0", name: "big.jpg", w: 6000, h: 4000 }],
    P14: [{ act: "replaceQuad", id: "F_p0", name: "rotated.jpg", w: 1200, h: 1600 }],
    P15: [{ act: "replaceBad", id: "F_p0" }],
    P16: [{ act: "resize", id: "F_p0", handle: "se", by: [-100, -100] }, { act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "resetPart", id: "F_p0" }],
    // ===== 試験台11 U1〜U6（元の位置に戻す・見せる範囲の拡大の直し）=====
    // U1：本文の右の辺を左へ60（大きさだけ変える）→「元の位置に戻す」が出る・押すと戻る
    U1: [{ act: "resize", id: "F_b0", handle: "e", by: [-60, 0] }, { act: "resetPart", id: "F_b0" }],
    // U2：写真の右下の角を左上へ60・60（大きさだけ変える）→ 戻す
    U2: [{ act: "resize", id: "F_p0", handle: "se", by: [-60, -60] }, { act: "resetPart", id: "F_p0" }],
    // U3：wide に差し替え→右下のつまみを画像の幅・高さと同じだけ右下へ（反対の角＝左上を止めて2倍）
    U3: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropCorner", id: "F_p0", dir: "se", fx: 1, fy: 1 }],
    // U4：U3 の後、右下のつまみを左上へ画像の半分→1倍
    U4: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropCorner", id: "F_p0", dir: "se", fx: 1, fy: 1 }, { act: "cropCorner", id: "F_p0", dir: "se", fx: -0.5, fy: -0.5 }],
    // U5：wide に差し替え→拡大の横棒で3倍（枠の真ん中を中心）
    U5: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropZoomBar", id: "F_p0", zoom: 3 }],
    // U6：写真を外す（メニューの出し分けの確認用。選んでおく）
    U6: [{ act: "select", id: "F_p0" }],
    // ===== 試験台12 J1〜J13（文字の見た目：大きさ・太さ・色）=====
    // J1：道具の出し分け（代表＝見出しを選ぶ。出し分けは本物の操作で verify）
    J1: [{ act: "select", id: "F_h0" }],
    // J2：特集1の見出しの大きさを 36（欄に打つ）
    J2: [{ act: "tsize", id: "F_h0", px: 36 }],
    // J3：PC で 36（端末の引き継ぎ・別々は verify で端末を切り替えて確認）
    J3: [{ act: "tsize", id: "F_h0", px: 36 }],
    // J4：見出しを「大きく」2回（24→28→32）
    J4: [{ act: "select", id: "F_h0" }, { act: "tgrow" }, { act: "tgrow" }],
    // J5：本文の太字（1回で700・2回で400）
    J5: [{ act: "select", id: "F_b0" }, { act: "tbold" }, { act: "tbold" }],
    // J6：本文の色＝テンプレ色2つ目（textMuted）→その他の色 #C03030
    J6: [{ act: "select", id: "F_b0" }, { act: "tcolor", color: "textMuted" }, { act: "tcolor", color: "#C03030" }],
    // J7：わらび餅の品の名前の色＝#C03030（全件に効く）
    J7: [{ act: "select", id: "card_name_c_warabi" }, { act: "tcolor", color: "#C03030" }],
    // J8：見出しと本文の2つを選んで大きさ 20
    J8: [{ act: "selectMany", ids: ["F_h0", "F_b0"] }, { act: "tsize", px: 20 }],
    // J9：甘味処の見出しを表の中（上端＋60・縦中心）へ→大きさ 40（表は押し下げない＝ownerOverlaps）
    J9: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }, { act: "tsize", id: "I_kanmi", px: 40 }],
    // J10：J2 のあと戻す→やり直す（24→36）
    J10: [{ act: "tsize", id: "F_h0", px: 36 }, { act: "undo" }, { act: "redo" }],
    // J11：見出しに大きさ・太字・色→右へ30→元の位置に戻す→文字の見た目を元に戻す
    J11: [{ act: "tsize", id: "F_h0", px: 36 }, { act: "tbold" }, { act: "tcolor", color: "#C03030" }, { act: "move", id: "F_h0", by: [30, 0] }, { act: "resetPart", id: "F_h0" }, { act: "treset", id: "F_h0" }],
    // J12：本文に「あ」を書き足し→太字（書き換えを決めてから効く）
    J12: [{ act: "editAppend", id: "F_b0", add: "あ" }, { act: "select", id: "F_b0" }, { act: "tbold" }],
    // J13：見出しの大きさに 200→120・3→8（範囲の外は端に丸める）
    J13: [{ act: "tsize", id: "F_h0", px: 200 }, { act: "tsize", px: 3 }],
    // ===== 試験台13 D1〜D12（文の一部の見た目・ページを元に戻す）=====
    // D1：本文の最初の4文字を #C03030
    D1: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }],
    // D2：最初の4文字を太字→もう一度で外す（1編集の中で）
    D2: [{ act: "editStart", id: "F_b0" }, { act: "editSel", s: 0, e: 4 }, { act: "partBold" }, { act: "editSel", s: 0, e: 4 }, { act: "partBold" }, { act: "editCommit" }],
    // D3：D1 の後、4文字目の後ろに「あ」を打つ（赤を引き継ぐ）
    D3: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "editStart", id: "F_b0" }, { act: "editCaret", pos: 4 }, { act: "editType", text: "あ" }, { act: "editCommit" }],
    // D4：赤4文字の真ん中（2文字目の後ろ）に1文字入れる（赤を引き継ぐ・前後の赤が消えない）
    D4: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "editStart", id: "F_b0" }, { act: "editCaret", pos: 2 }, { act: "editType", text: "ん" }, { act: "editCommit" }],
    // D5：D1（端末切り替えは verify で）
    D5: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }],
    // D6：本文まるごと太字（何も選ばず）
    D6: [{ act: "editStart", id: "F_b0" }, { act: "boxBoldPart", id: "F_b0" }],
    // D7：わらび餅の品名の最初の2文字を赤（その1件だけ）
    D7: [{ act: "partRun", id: "card_name_c_warabi", s: 0, e: 2, kind: "color", value: "#C03030" }],
    // D8：本文の最初の4文字を 1.5倍（箱16→24）
    D8: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "scale", value: 1.5 }],
    // D9：見出し箱を大きさ36・色#7B7B7B、本文4文字を赤、見出し右30、写真の見せる範囲→「このページを元に戻す」
    D9: [{ act: "select", id: "F_h0" }, { act: "tsize", id: "F_h0", px: 36 }, { act: "tcolor", id: "F_h0", color: "textMuted" }, { act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "move", id: "F_h0", by: [30, 0] }, { act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropZoom", id: "F_p0", zoom: 2 }, { act: "pageReset" }],
    // D10：D1 の後、文字の見た目を元に戻す
    D10: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "treset", id: "F_b0" }],
    // D11：D1 の後、戻す→やり直す
    D11: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "undo" }, { act: "redo" }],
    // D12：D1 の後、本文の最初の6文字を特集2の本文の末尾へ（貼り付け＝文字だけ・貼り先の見た目を引き継ぐ）
    D12: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "editStart", id: "F_b1" }, { act: "editCaretEnd" }, { act: "editTypeFromBody", n: 6 }, { act: "editCommit" }],
    // ===== 試験台14 C1〜C11（セクションの操作）。@dup/@add は直前に作ったセクションの ID に置き換わる。=====
    C1: [{ act: "secMove", id: "items", delta: -1 }],
    C2: [{ act: "secMove", id: "items", delta: -1 }, { act: "undo" }],
    C3: [{ act: "edit", id: "F_h0", text: "季節の上生菓子と抹茶" }, { act: "secDup", id: "feature" }],
    C4: [{ act: "edit", id: "F_h0", text: "季節の上生菓子と抹茶" }, { act: "secDup", id: "feature" }, { act: "move", id: "@dup__F_h0", by: [30, 0] }, { act: "edit", id: "@dup__F_h0", text: "新しい見出し" }],
    C5: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_kanmi", edge: "bottom", off: 1 }, { act: "secDel", id: "items" }, { act: "undo" }],
    C6: [{ act: "secAdd", pos: 1, type: "feature" }],
    C7: [{ act: "secAdd", pos: 1, type: "feature" }, { act: "dropPhoto", id: "@add__F_p0", name: "wide.jpg", w: 1600, h: 600 }],
    C8: [{ act: "secMove", id: "items", delta: -1 }],
    C9: [{ act: "secMove", id: "items", delta: -1 }, { act: "move", id: "F_h0", by: [30, 0] }, { act: "pageReset" }],
    C10: [{ act: "edit", id: "F_h0", text: "季節の上生菓子と抹茶" }, { act: "secDup", id: "feature" }, { act: "tsize", id: "@dup__F_hg", px: 36 }],
    C11: [{ act: "secDel", id: "items" }],
    // ===== 試験台14 C12（X3：品の並びを選んでから品名を書き換え＝選びが品名に移り道具が出る）=====
    C12: [{ act: "select", id: "I_cards" }, { act: "editStart", id: "card_name_c_warabi" }],
    // ===== 試験台15 S1〜S16（スマホでの指の操作）＝プリセットでは再現しない（CDP の指の操作で試験する）=====
    S1: [{ act: "fingerOnly" }], S2: [{ act: "fingerOnly" }], S3: [{ act: "fingerOnly" }], S4: [{ act: "fingerOnly" }],
    S5: [{ act: "fingerOnly" }], S6: [{ act: "fingerOnly" }], S7: [{ act: "fingerOnly" }], S8: [{ act: "fingerOnly" }],
    S9: [{ act: "fingerOnly" }], S10: [{ act: "fingerOnly" }], S11: [{ act: "fingerOnly" }], S12: [{ act: "fingerOnly" }],
    S13: [{ act: "fingerOnly" }], S14: [{ act: "fingerOnly" }], S15: [{ act: "fingerOnly" }], S16: [{ act: "fingerOnly" }],
    // ===== 試験台16 S17〜S38（スマホでの指・ピンチ）＝プリセットでは再現しない（CDP の指の操作で試験する）=====
    S17: [{ act: "fingerOnly" }], S18: [{ act: "fingerOnly" }], S19: [{ act: "fingerOnly" }], S20: [{ act: "fingerOnly" }],
    S21: [{ act: "fingerOnly" }], S22: [{ act: "fingerOnly" }], S23: [{ act: "fingerOnly" }], S24: [{ act: "fingerOnly" }],
    S25: [{ act: "fingerOnly" }], S26: [{ act: "fingerOnly" }], S27: [{ act: "fingerOnly" }], S28: [{ act: "fingerOnly" }],
    S29: [{ act: "fingerOnly" }], S30: [{ act: "fingerOnly" }], S31: [{ act: "fingerOnly" }], S32: [{ act: "fingerOnly" }],
    S33: [{ act: "fingerOnly" }], S34: [{ act: "fingerOnly" }], S35: [{ act: "fingerOnly" }], S36: [{ act: "fingerOnly" }],
    S37: [{ act: "fingerOnly" }], S38: [{ act: "fingerOnly" }],
    // ===== 試験台17 K1〜K27（写真を変える・足す・明るさ・テキストの入り方）。写真を選ぶ画面を通る番号は試験用画像を直接入れる =====
    K1: [{ act: "select", id: "F_p0" }],                                                   // 写真を変えるボタン（位置は verify で本物の操作）
    K2: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }],           // 差し替え
    K3: [{ act: "move", id: "F_p0", by: [60, 0] }],                                        // ボタンから右60＝写真が動く
    K4: [{ act: "select", id: "I_cards" }, { act: "replaceQuadCard", cardId: "c_warabi", name: "tall.jpg", w: 600, h: 1600 }],
    K5: [{ act: "clearPhoto", id: "F_p1" }],                                               // 写真を外す→写真を選ぶボタン
    K6: [{ act: "clearPhoto", id: "F_p1" }, { act: "replaceQuad", id: "F_p1", name: "wide.jpg", w: 1600, h: 600 }],
    K7: [{ act: "clearPhoto", id: "F_p1" }, { act: "move", id: "F_p1", by: [0, 50] }],
    K8: [{ act: "secAdd", pos: 1, type: "feature" }, { act: "dropPhoto", id: "@add__F_p0", name: "wide.jpg", w: 1600, h: 600 }],
    K9: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }],                          // 写真を足す（中身の幅の半分）
    K10: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }],                         // もう一方の端末は verify で
    K11: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAdded", by: [-200, 80] }, { act: "undo" }, { act: "undo" }, { act: "redo" }, { act: "redo" }],
    K12: [{ act: "addPhoto", name: "tall.jpg", w: 600, h: 1600 }],                         // 4:5 になる
    K13: [{ act: "addPhotoAt", name: "wide.jpg", w: 1600, h: 600, sec: "feature", cx: 80, cy: 240 }],
    K14: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "replaceQuad", id: "F_p0", name: "tall.jpg", w: 600, h: 1600 }],
    K15: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "deleteSel", sel: "lastAdd" }],
    K16: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAdded", by: [-200, 80] }, { act: "pageReset" }],
    K17: [{ act: "addTextCentered", text: "新しい文" }],
    K18: [{ act: "addTextCentered", text: "" }],                                           // 空＝なかったことに
    K19: [{ act: "select", id: "F_p0" }, { act: "bright", id: "F_p0", v: 20 }],
    K20: [{ act: "bright", id: "F_p0", v: 20 }, { act: "pageReset" }],
    K21: [{ act: "bright", id: "F_p0", v: 20 }, { act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }],
    K22: [{ act: "bright", id: "F_p0", v: 20 }, { act: "clearPhoto", id: "F_p0" }, { act: "unclearPhoto", id: "F_p0" }],
    K23: [{ act: "brightCard", cardId: "c_warabi", v: -20 }],
    K24: [{ act: "selectMany", ids: ["F_p0", "F_p1"] }],                                    // 明るさ▾ が出ない（verify）
    K25: [{ act: "select", id: "F_p0" }],                                                   // 明るさ▾→Esc（verify）
    K26: [{ act: "select", id: "F_p0" }],                                                   // 見せる範囲・動かし中はボタンが出ない（verify）
    K27: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "bright", id: "F_p0", v: 20 }],
    // ===== 試験台18 L1〜L15（試験台17 の直し）。本物の操作は verify_l で確かめる（ここは状態の再現） =====
    L1: [{ act: "move", id: "F_p1", by: [0, 30] }],
    L2: [{ act: "select", id: "F_p1" }],
    L3: [{ act: "select", id: "F_p1" }],
    L4: [{ act: "replaceQuad", id: "F_p1", name: "wide.jpg", w: 1600, h: 600 }, { act: "replaceQuad", id: "F_p1", name: "tall.jpg", w: 600, h: 1600 }],
    L5: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }],
    L6: [{ act: "fingerOnly" }],
    L7: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }],
    L8: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }, { act: "deleteSel", sel: "lastAdd" }],
    L9: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }],
    L10: [{ act: "addTextCentered", text: "足した文" }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }],
    L11: [{ act: "select", id: "F_h0" }, { act: "dup" }],
    L12: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "pageReset" }],
    L13: [{ act: "select", id: "F_p0" }],
    L14: [{ act: "bright", id: "F_p0", v: 20 }, { act: "select", id: "F_p0" }, { act: "dup" }, { act: "select", id: "F_p0" }, { act: "copyPaste" }],
    L15: [{ act: "select", id: "F_p0" }],
    // ===== 試験台18b L16〜L19（X18：押し下げに付いていく部品も付いていく）。本物の操作は verify_l で確かめる（ここは状態の再現） =====
    // L16/L17：SP で本文 F_b1 を右45・下(90/135)（F_h1 に付く M2）→ PC で F_b0 の下に写真→ SP
    L16: [{ act: "setDev", d: "sp" }, { act: "move", id: "F_b1", by: [45, 90] }, { act: "setDev", d: "pc" }, { act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }, { act: "setDev", d: "sp" }],
    L17: [{ act: "setDev", d: "sp" }, { act: "move", id: "F_b1", by: [45, 135] }, { act: "setDev", d: "pc" }, { act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }, { act: "setDev", d: "sp" }],
    // L18：L16 のあと PC で足した写真を消す→ SP（付いていく部品も含めて元の位置へ）
    L18: [{ act: "setDev", d: "sp" }, { act: "move", id: "F_b1", by: [45, 90] }, { act: "setDev", d: "pc" }, { act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }, { act: "deleteSel", sel: "lastAdd" }, { act: "setDev", d: "sp" }],
    // L19：SP で F_b1 を下90（F_h1 に付く M2）→ PC で F_h0 を複製（Cmd+D）→ SP
    L19: [{ act: "setDev", d: "sp" }, { act: "move", id: "F_b1", by: [0, 90] }, { act: "setDev", d: "pc" }, { act: "select", id: "F_h0" }, { act: "dup" }, { act: "setDev", d: "sp" }],
    // ===== 試験台19 O1〜O20（リンク・書体・X19）。本物の操作は verify_o で確かめる（ここは状態の再現） =====
    O1: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
    O2: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
    O3: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
    O4: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "page", page: "pg_menu" } }],
    O5: [{ act: "partLink", id: "F_b0", sub: "練り切り", link: { kind: "url", href: "https://www.example.com" } }, { act: "partLink", id: "F_b0", sub: "きんとん", link: { kind: "mailto", addr: "info@example.com" } }],
    O6: [{ act: "editAppend", id: "F_b0", add: " https://example.com " }, { act: "partLink", id: "F_b0", sub: "https://example.com", link: { kind: "url", href: "https://example.com" } }],
    O7: [{ act: "partLink", id: "F_b0", sub: "季節", link: { kind: "url", href: "https://example.com" } }],
    O8: [{ act: "editAppend", id: "F_b0", add: " 0797-12-3456 " }],
    O9: [],
    O10: [{ act: "elemLink", id: "F_p0", link: { kind: "line" } }],
    O11: [{ act: "elemLink", id: "I_pillbg", link: { kind: "page", page: "pg_contact" } }],
    O12: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
    O13: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }, { act: "elemLink", id: "F_p0", link: { kind: "line" } }],
    O14: [{ act: "select", id: "F_h0" }],
    O15: [{ act: "boxFont", id: "F_h0", font: "body" }],
    O16: [{ act: "partFont", id: "F_b0", sub: "季節の移ろい", font: "heading" }],
    O17: [{ act: "boxFont", id: "F_h0", font: "body" }, { act: "partFont", id: "F_b0", sub: "季節の移ろい", font: "heading" }],
    O18: [{ act: "boxFont", id: "F_b0", font: "heading" }],
    O19: [],
    O20: [],
    // ===== 試験台19b O21〜O29（上の道具の1段化・書体/明るさの仮表示・リンク一覧の位置・コピーの引き継ぎ）=====
    O21: [],
    O22: [{ act: "partFont", id: "F_b0", sub: "季節の移ろい", font: "body" }, { act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
    O23: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
    O24: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
    O25: [{ act: "elemLink", id: "F_p0", link: { kind: "instagram" } }],
    O26: [],
    O27: [],
    O28: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
    O29: [],
    // ===== 試験台20 L1〜L24（列・幅・重ねる・左右入替・X23/X24）=====
    // 窓幅での道具の畳み（L20〜L22）・指の操作（L23/L24）・ドラッグ中の見た目（L14）は、データでの再現なし＝winOnly
    L1: [{ act: "setDev", d: "pc" }, { act: "select", id: "I_cards" }],                                   // 列 ▾ は品の並び全体のときだけ出る（選択で確認）
    L2: [{ act: "setDev", d: "pc" }, { act: "select", id: "I_cards" }],                                   // 見本に乗せる仮表示＝残らない（終状態は3列のまま）
    L3: [{ act: "setDev", d: "pc" }, { act: "cols", id: "I_cards", n: 2 }],                               // PC 2列＝1件651・どら焼き2段目・段間64
    L4: [{ act: "setDev", d: "pc" }, { act: "cols", id: "I_cards", n: 2 }, { act: "undo" }, { act: "redo" }],  // 戻す→やり直す
    L5: [{ act: "setDev", d: "sp" }, { act: "cols", id: "I_cards", n: 2 }],                               // SP 2列＝1件163.5・段間40
    L6: [{ act: "setDev", d: "pc" }, { act: "cols", id: "I_cards", n: 3 }, { act: "resize", id: "card_name_c_warabi", handle: "e", by: [400, 0] }],  // 品名の右の辺＝1件の幅で止まる
    L7: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_cards", handle: "e", by: [-358, 0], alt: true }],  // 右の辺を左358（Alt）＝幅968・3列
    L8: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_cards", handle: "w", by: [1200, 0] }],       // 左の辺を右へ＝最小幅で止まる
    L9: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_cards", handle: "e", by: [-900, 0], alt: true }, { act: "select", id: "I_cards" }],  // 狭めると4列が押せなくなる（UIは試験で）
    L10: [{ act: "setDev", d: "pc" }, { act: "resizeTo", id: "I_table", handle: "e", w: 720 }],           // 表の右の辺＝幅720・名前/価格は右端そろえ
    L11: [{ act: "setDev", d: "pc" }, { act: "cols", id: "I_cards", n: 2 }, { act: "resize", id: "I_table", handle: "e", by: [-200, 0] }, { act: "pageReset" }],  // このページを元に戻す＝列も幅も戻る
    L12: [{ act: "setDev", d: "sp" }, { act: "dropOverlap", id: "F_h0", onto: "F_p0" }],                  // 見出しを写真の箱へ落とす＝重なる（M2・anchor F_p0）
    L13: [{ act: "setDev", d: "sp" }, { act: "moveCenterToRef", id: "F_b0", ref: "F_p0", edge: "bottom", off: -8 }],  // 写真下端−8＝帯の中で並び替え（M2にならない）
    L14: [{ act: "winOnly" }],                                                                             // 押したままの drop-line はドラッグ中の見た目＝再現なし
    L15: [{ act: "setDev", d: "pc" }, { act: "swap", id: "F_p0" }],                                        // 左右を入れ替える（特集1の写真/本文）
    L16: [{ act: "setDev", d: "pc" }, { act: "select", id: "F_p0" }],                                      // 入替メニューは横並びの組のときだけ（選択で確認）
    L17: [{ act: "setDev", d: "pc" }, { act: "swap", id: "F_h0" }],                                        // 位置が左右反転（新しい左＝ページ幅−今の右）
    L18: [{ act: "setDev", d: "pc" }, { act: "swap", id: "F_p0" }, { act: "undo" }],                       // 入替を戻す
    L19: [],                                                                                               // 既定＝重なり0・はみ出し0
    L20: [{ act: "winOnly" }],                                                                              // 幅520/500/400 でリンクが その他 へ（窓幅）
    L21: [{ act: "winOnly" }],                                                                              // その他 の中身＝名前つき・44px・順・区切り（窓幅）
    L22: [{ act: "winOnly" }],                                                                              // 幅500 で 列 を その他 から（窓幅）
    L23: [{ act: "winOnly" }],                                                                              // スマホの長押しの箱に 列（指）
    L24: [{ act: "winOnly" }],                                                                              // スマホで辺のつまみを指で（指）
    // ===== 試験台20b（L25〜L32）=====
    L25: [{ act: "setDev", d: "pc" }, { act: "moveCenterToRef", id: "I_divider", ref: "I_cards", edge: "top", off: -20 }],        // §1(X26) 区切り線を品の並びの上端−20へ＝一番上に並び替え（SP も同じ操作で確認）
    L26: [{ act: "setDev", d: "pc" }, { act: "moveCenterToRef", id: "I_divider", ref: "I_pillbg", edge: "bottom", off: 20 }],     // §1(X26) ボタンの下端＋20へ＝一番下に並び替え
    L27: [{ act: "setDev", d: "sp" }, { act: "dropOverlap", id: "F_h0", onto: "F_p0" }],                   // L12 の再確認（写真の箱へ＝重なる）。L13(帯で並び替え)は既存 L13 プリセットで
    L28: [{ act: "winOnly" }],                                                                              // 窓幅500 で その他▾ の『PC』行が読める（X25・窓幅＝再現なし）
    L29: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_table", handle: "e", by: [-2000, 0], alt: true }],                  // §2 表を最小幅（値段1行・≈687）まで
    L30: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_table", handle: "e", by: [-2000, 0], alt: true }, { act: "edit", id: "row_price_t_matcha", text: "1,100円（税込・上生菓子付き）" }],  // §2.4 最小の後に値段を長く＝表示だけ広がる（記録は不変）。終状態＝書き換え後
    L31: [{ act: "setDev", d: "sp" }, { act: "resize", id: "I_table", handle: "e", by: [-2000, 0], alt: true }],                  // §2.6 SP 表を最小幅（200 と値段1行の広い方）まで
    L32: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_cards", handle: "e", by: [-918, 0], alt: true }, { act: "select", id: "I_cards" }],  // §3 品の並び幅408＝列の見本で4列が灰色（見本UI・その他経由は窓幅で再現なし）
    // ===== 試験台22a（W20〜W23）=====
    W20: [{ act: "setFixedSections", on: true }],   // §7 仮の一番上・一番下（右クリック操作・＋・隣の向きは試験で確認）
    W21: [],                                          // §7 開いた直後（setFixedSections=false）＝20b と一致
    W22: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [-619, 0] }, { act: "zmove", id: "F_p0", m: "back" }, { act: "zmove", id: "F_p0", m: "forward" }],   // §8 最背面→前面へ移動＝写真が見出しの前・本文の後ろ
    W23: [{ act: "winOnly" }],                         // X27 離す前の dropTarget（ドラッグ中の見た目＝再現なし）
    W24: [{ act: "winOnly" }],                         // §3.3 窓幅での道具の畳み・スマホの並び＝再現なし（試験で確認）
    // ===== 試験台22b（W1〜W7・W19）=====
    W1: [{ act: "setDev", d: "pc" }],                  // §2/§3 新しい文脈で開く＝まだ公開していません・履歴は最初の形だけ（文脈は試験側）
    W2: [{ act: "winOnly" }],                          // §2 開き直しは文脈の外＝再現なし
    W3: [{ act: "winOnly" }],                          // §2 開き直しは再現なし
    W4: [{ act: "winOnly" }],                          // §2 写真を足して開き直し＝再現なし
    W5: [{ act: "setDev", d: "pc" }, { act: "simError", on: true }, { act: "edit", id: "F_h0", text: "保存失敗テスト" }, { act: "simError", on: false }, { act: "edit", id: "F_h0", text: "復帰テスト" }],   // §2.6 保存失敗→復帰
    W6: [{ act: "setDev", d: "pc" }, { act: "edit", id: "F_h0", text: "公開テスト" }, { act: "publish" }],   // §4.3 公開＝確認の箱なし・公開中と同じに
    W7: [{ act: "setDev", d: "pc" }, { act: "edit", id: "F_h0", text: "公開テスト" }, { act: "publish" }, { act: "edit", id: "F_h0", text: "さらに変更" }],   // §3.2 公開後に変更＝未公開の変更あり
    W19: Array.from({ length: 32 }, (_, i) => [{ act: "edit", id: "F_h0", text: "版" + i }, { act: "publish" }]).flat(),   // §4.3 32回公開→公開した版30＋最初の形
    // ===== 試験台22c（W8〜W13）=====
    W8: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [-619, 0] }, { act: "setDev", d: "sp" }, { act: "dropOverlap", id: "F_h0", onto: "F_p0" }, { act: "editAppend", id: "F_b0", add: "とても長い本文をここに足して、スマホの配置でも目安の行数をしっかり越えるようにします。季節のうつろいを、小さな菓子に写してお届けします。四季折々の意匠をお楽しみください。" }, { act: "secAdd", type: "feature" }, { act: "setDev", d: "pc" }],   // §4.1 確認の箱に PC重なり・SP重なり・長い文・写真のない枠（箱の表示は試験で公開を押す）
    W9: [{ act: "winOnly" }],                          // §4.1 箱の「見る」＝UI（試験で）
    W10: [{ act: "winOnly" }],                         // §4.1 戻って直す／このまま公開する＝UI（試験で）
    W11: [{ act: "setDev", d: "pc" }],                 // §4.2 longTextLimits() を見るだけ
    W12: [{ act: "setDev", d: "pc" }, { act: "setLink", id: "card_photo_c_warabi", link: { kind: "url", href: "https://example.com" } }, { act: "preview", on: true }],   // §5 プレビュー＋よそのリンク（押すのは試験で）
    W13: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [-619, 0] }, { act: "secAdd", type: "feature" }, { act: "preview", on: true }],   // §5 公開の描き方＝写真のない枠は詰める
    // ===== 試験台22d（W14〜W18）§6 履歴から前の版に戻す =====
    W14: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "editAppend", id: "F_b0", add: S1_ADD }],   // §6.1 下書き（未公開変更）＋公開2つ＋最初の形（板を出すのは試験）
    W15: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "editAppend", id: "F_b0", add: S1_ADD }, { act: "viewVersion", which: "oldestPub" }, { act: "setDev", d: "sp" }],   // §6.2 古い版を見るだけ（ドラッグで動かないのは試験）
    W16: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "editAppend", id: "F_b0", add: S1_ADD }, { act: "viewVersion", which: "oldestPub" }, { act: "restoreVersion" }],   // §6.3/§6.4 この版を下書きに＝写真は右30だけ・本文の足しは消える・戻す前の下書きが1つ
    W17: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "editAppend", id: "F_b0", add: S1_ADD }, { act: "viewVersion", which: "oldestPub" }, { act: "restoreVersion" }, { act: "undo" }],   // §6.5 戻す＝置き換える前の下書きへ（本文の足し戻る・写真右60）
    W18: [{ act: "setDev", d: "pc" }, { act: "viewVersion", which: "initial" }, { act: "restoreVersion" }],   // §6 最初の形を下書きに＝新しい文脈の直後と同じ
  };
}
let lastSec = null;   // プリセットで直前に作った（複製・追加した）セクションの ID。@dup/@add が指す。
let lastAdd = null;   // §3（試験台17）プリセットで直前に足した部品の ID
async function runPreset(name) {
  reset(); lastSec = null; lastAdd = null;
  for (const step of presets()[name]) await runStep(step);
}
async function runStep(step) {
  if (step.id && step.id.includes("@")) step = { ...step, id: step.id.replace(/@dup|@add/g, lastSec || "") };
  const g = geometry();
  // §2 セクションの操作
  if (step.act === "secMove") { sectionMove(step.id, step.delta); return; }
  if (step.act === "secDel") { sectionDelete(step.id); return; }
  if (step.act === "secDup") { sectionDuplicate(step.id); lastSec = "sec" + state.secSeq; return; }
  if (step.act === "secAdd") { sectionAdd(step.pos, step.type); lastSec = "sec" + state.secSeq; return; }
  if (step.act === "dropPhoto") { const f = await quadFile(step.name, step.w, step.h, step.type); selectMany([canonId(step.id)]); await replacePhotoFile(step.id, f); return; }
  if (step.act === "move") { const c = canonId(step.id); programMove([c], (id) => ({ x: g[id].x + step.by[0], y: g[id].y + step.by[1] })); }
  else if (step.act === "moveToBelow") { const t = g[step.target]; programMove([step.id], () => ({ x: g[step.alignLeft].x, y: t.y + t.h + step.gap })); }
  else if (step.act === "moveGroupBelow") { const t = g[step.target]; const stackTop = t.y + t.h + step.gap; programMove(step.ids, (id, i) => ({ x: g[step.alignLeft].x, y: stackTop + i * (g[id].h + 8) })); }
  else if (step.act === "edit") editApi(step.id, step.text);
  else if (step.act === "editAppend") editApi(step.id, rawText(canonId(step.id)) + step.add);
  else if (step.act === "addBelow") addTextAtSilent(step.marker, step.gap, step.text);
  else if (step.act === "moveAddedBelowSection") { const R = reduce(activeOps()); const last = R.adds[R.adds.length - 1]; if (last) { const s = sections()[secOf(last.id)]; const targetY = s.height + step.extra; programMove([last.id], () => ({ x: g[last.id].x, y: targetY })); } }
  // --- R 用 ---
  else if (step.act === "moveToCardDesc") { const card = contentCards()[step.cardIndex]; if (card) { const tid = "card_desc_" + card.id; const t = g[tid]; if (t) programMove([step.id], () => ({ x: g[step.id].x, y: t.y })); } }
  else if (step.act === "delCard") { const card = contentCards()[step.cardIndex]; if (card) cardsDelete("card_photo_" + card.id); }   // 試験台26：① 連動
  else if (step.act === "delRow") { const row = contentRows()[step.rowIndex]; if (row) tableDelete("row_name_" + row.id); }
  else if (step.act === "dupRow") { const row = contentRows()[step.rowIndex]; if (row) tableDuplicate("row_name_" + row.id); }
  else if (step.act === "moveToRef") { const r = g[step.ref]; if (r) { const y = (step.edge === "bottom" ? r.y + r.h : r.y) + step.off; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
  else if (step.act === "moveCenterToRef") { const r = g[step.ref]; if (r) { const y = (step.edge === "bottom" ? r.y + r.h : r.y) + step.off - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y }), { snap: !!step.snap }); } }
  else if (step.act === "copyPaste") { if (step.id) selectMany([canonId(step.id)]); copySelection(); paste(); }
  else if (step.act === "dup") { if (step.id) selectMany([canonId(step.id)]); duplicate(); }
  else if (step.act === "reorderBetween") { const a = g[step.after], b = g[step.before]; if (a && b) { const y = (a.y + a.h + b.y) / 2 - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
  else if (step.act === "reorderBefore") { const b = g[step.before]; if (b) { const y = b.y - g[step.id].h - 4; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
  else if (step.act === "moveAddedToRowGap") { const R = reduce(activeOps()); const last = R.adds[R.adds.length - 1]; const rows = contentRows(); const r1 = g["row_name_" + rows[step.afterRow].id], r2 = g["row_name_" + rows[step.afterRow + 1].id]; if (last && r1 && r2) { const y = (r1.y + r1.h + r2.y) / 2; programMove([last.id], () => ({ x: g[last.id].x, y })); } }
  // --- W 用 ---
  else if (step.act === "select") { selectMany([step.id]); }
  else if (step.act === "zback") { sendToBack(); }
  else if (step.act === "zfront") { bringToFront(); }
  else if (step.act === "zmove") { selectMany([canonId(step.id)]); ({ front: bringToFront, back: sendToBack, forward: bringForward, backward: sendBackward }[step.m] || (() => {}))(); }   // §22 §8
  else if (step.act === "setFixedSections") { setFixedSections(step.on); }   // §22 §7
  else if (step.act === "publish") { publish(step.opts || { force: true }); }   // §22 §4.3
  else if (step.act === "simError") { simulateSaveError(step.on); }   // §22 §2.6
  else if (step.act === "preview") { if (step.on === false) exitPreview(); else enterPreview(); }   // §22 §5
  else if (step.act === "viewVersion") { viewVersion(resolveVerId(step)); }   // §22 §6 見るだけ
  else if (step.act === "restoreVersion") { restoreVersion(step.id || state.viewing); }   // §22 §6 この版を下書きにする
  else if (step.act === "exitView") { exitView(); }   // §22 §6 見るだけをやめる
  else if (step.act === "setLink") { setElementLink(canonId(step.id), step.link); }   // §22 §5（リンク）
  else if (step.act === "secAdd") { sectionAdd(step.pos != null ? step.pos : (reduce(activeOps()).secList.length), step.type || "feature"); lastSec = "sec" + state.secSeq; }   // §22 §4.2 写真のない枠
  else if (step.act === "resetSection") { resetScope("section", step.sec === "feature" ? "F_h0" : "I_kanmi", [state.device]); }
  else if (step.act === "moveCenterToCenter") { const r = g[step.ref]; if (r) { const y = r.y + r.h / 2 + (step.off || 0) - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
  else if (step.act === "moveCenterToGap") { const a = g[step.after], b = g[step.before]; if (a && b) { const y = (a.y + a.h + b.y) / 2 - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
  // --- Y 用（大きさ・選択）---
  else if (step.act === "resize") { selectMany([step.id]); programResize(step.id, step.handle, step.by[0], step.by[1], !!step.alt); }
  else if (step.act === "cols") { selectMany([canonId(step.id)]); setCols(step.id, step.n); }   // §20 列
  else if (step.act === "swap") { selectMany([canonId(step.id)]); swapHoriz(step.id); }   // §5 左右を入れ替える
  else if (step.act === "dropOverlap") {   // §4 他の部品の箱の上に落として重ねる（実ドラッグの経路＝M2・anchor=落とした先）
    const c = canonId(step.id); selectMany([c]); const sN = elNode(c), dN = elNode(canonId(step.onto));
    if (sN && dN) { const sr = sN.getBoundingClientRect(), dr = dN.getBoundingClientRect(); if (beginDrag(sr.left + sr.width / 2, sr.top + sr.height / 2)) { dragMove(dr.left + dr.width / 2, dr.top + dr.height / 2, false); endDrag(); } } }
  else if (step.act === "winOnly") { if (typeof console !== "undefined") console.log("窓幅での道具の畳み／指の操作のため、データでの再現なし（試験で確認）"); }
  else if (step.act === "resizeTo") { const c = canonId(step.id); const cur = g[c].w; const ddx = step.handle === "e" ? (step.w - cur) : (cur - step.w); selectMany([c]); programResize(c, step.handle, ddx, 0); }
  else if (step.act === "selectRow") { const rows = contentRows(); if (rows[step.index]) selectMany(["row_name_" + rows[step.index].id]); }
  else if (step.act === "undo") { undo(); }
  else if (step.act === "redo") { redo(); }
  else if (step.act === "resetPart") { resetScope("part", canonId(step.id), [state.device]); }
  // --- Z 用（そろえる）---
  else if (step.act === "moveDev") { const by = state.device === "pc" ? step.pc : step.sp; const c = canonId(step.id); programMove([c], (id) => ({ x: g[id].x + by[0], y: g[id].y + by[1] })); }
  else if (step.act === "snapAlignLeft") { const r = g[step.ref]; if (r) programMove([step.id], () => ({ x: r.x + step.off, y: g[canonId(step.id)].y }), { snap: !step.alt }); }
  else if (step.act === "snapAlignCenterContent") { const { left: cL, right: cR } = contentEdges(); const cC = (cL + cR) / 2; const c = canonId(step.id); programMove([c], () => ({ x: cC + step.off - g[c].w / 2, y: g[c].y }), { snap: !step.alt }); }
  else if (step.act === "snapResizeRight") { const c = canonId(step.id), r = g[step.ref]; if (r) { const ddx = (r.x + r.w + step.off) - (g[c].x + g[c].w); selectMany([c]); programResize(c, "e", ddx, 0, !!step.alt); } }
  else if (step.act === "arrow") { if (step.id) selectMany([canonId(step.id)]); const d = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[step.dir]; for (let i = 0; i < (step.times || 1); i++) nudgeSelected(d[0], d[1]); }
  // --- P 用（写真の差し替え・見せる範囲。画像はここで作る）---
  else if (step.act === "replaceQuad") { const f = await quadFile(step.name, step.w, step.h, step.type); selectMany([step.id]); await replacePhotoFile(step.id, f); }
  else if (step.act === "replaceQuadCard") { const id = "card_photo_" + step.cardId; const f = await quadFile(step.name, step.w, step.h, step.type); await replacePhotoFile(id, f); }
  else if (step.act === "replaceBad") { await replacePhotoFile(step.id, textFile("notimage.txt")); }
  else if (step.act === "clearPhoto") { commit({ t: "clear", id: step.id }); }
  else if (step.act === "cropPan") { beginCrop(step.id); cropPanStart(); cropPanBy(step.by[0], step.by[1]); cropCommit(); }
  else if (step.act === "cropPanCancel") { beginCrop(step.id); cropPanStart(); cropPanBy(step.by[0], step.by[1]); cropCancel(); }
  else if (step.act === "cropZoom") { beginCrop(step.id); cropZoomTo(step.zoom); cropCommit(); }
  // --- U 用（試験台11）---
  else if (step.act === "cropCorner") { beginCrop(step.id); cropCornerStart(step.dir); const d = cropState().display; cropCornerBy(step.fx * d.dw, step.fy * d.dh); cropCommit(); }
  else if (step.act === "cropZoomBar") { beginCrop(step.id); cropZoomTo(step.zoom); cropCommit(); }
  // --- J 用（試験台12 文字の見た目）---
  else if (step.act === "selectMany") { selectMany(step.ids); }
  else if (step.act === "tsize") { if (step.id) selectMany([canonId(step.id)]); textSetSize(step.px); }
  else if (step.act === "tgrow") { textStep(1); }
  else if (step.act === "tshrink") { textStep(-1); }
  else if (step.act === "tbold") { if (step.id) selectMany([canonId(step.id)]); textToggleBold(); }
  else if (step.act === "tcolor") { if (step.id) selectMany([canonId(step.id)]); textSetColor(step.color); }
  else if (step.act === "treset") { resetTextStyle(canonId(step.id)); }
  // --- D 用（試験台13 文の一部の見た目）---
  else if (step.act === "partRun") { startEdit(step.id); const n = elNode(state.editing.id); setCaretOffsets(n, step.s, step.e); applyPartStyle(step.kind, step.value); commitEdit(); }
  else if (step.act === "editStart") { startEdit(step.id); }
  else if (step.act === "editSel") { setCaretOffsets(elNode(state.editing.id), step.s, step.e); }
  else if (step.act === "editCaret") { setCaretOffsets(elNode(state.editing.id), step.pos, step.pos); }
  else if (step.act === "editCaretEnd") { const L = (state.editing.runs || []).reduce((a, r) => a + r.text.length, 0); setCaretOffsets(elNode(state.editing.id), L, L); }
  else if (step.act === "partBold") { applyPartStyle("bold"); }
  else if (step.act === "partColor") { applyPartStyle("color", step.value); }
  else if (step.act === "partScale") { applyPartStyle("scale", step.value); }
  else if (step.act === "editType") { const n = elNode(state.editing.id); n.focus(); document.execCommand("insertText", false, step.text); reconcileEdit(); }
  else if (step.act === "editTypeFromBody") { const t = rawText("F_b0").slice(0, step.n || 6); const n = elNode(state.editing.id); n.focus(); document.execCommand("insertText", false, t); reconcileEdit(); }
  else if (step.act === "editCommit") { commitEdit(); }
  else if (step.act === "boxBoldPart") { if (state.editing) commitEdit(); selectMany([step.id]); textToggleBold(); }
  else if (step.act === "pageReset") { resetScope("page", null, ["pc", "sp"]); }
  else if (step.act === "setDev") { setDevice(step.d); }
  // §19 書体・リンク（状態の再現）
  else if (step.act === "boxFont") { selectMany([canonId(step.id)]); textSetFont(step.font); }
  else if (step.act === "elemLink") { setElementLink(canonId(step.id), step.link); }
  else if (step.act === "partLink") { const c = canonId(step.id); const plain = textRunsApi(c).map((r) => r.text).join(""); const i = plain.indexOf(step.sub); if (i >= 0) setPartLinkCommitted(c, i, i + step.sub.length, step.link); }
  else if (step.act === "partFont") { const c = canonId(step.id); const plain = textRunsApi(c).map((r) => r.text).join(""); const i = plain.indexOf(step.sub); if (i >= 0) { startEdit(c); setCaretOffsets(elNode(c), i, i + step.sub.length); applyPartStyle("font", step.font); commitEdit(); } }
  // --- K 用（試験台17 写真を変える・足す・明るさ・テキスト）---
  else if (step.act === "addPhoto") { const f = await quadFile(step.name, step.w, step.h, step.type); const cx = SPEC.DESIGN_W[state.device] / 2; const gg = geometry(); const cy = (gg[step.at || "F_b0"] ? gg[step.at || "F_b0"].y + gg[step.at || "F_b0"].h / 2 : 300); lastAdd = await addPhotoAtPoint(f, step.sec || "feature", cx, cy); }
  else if (step.act === "addPhotoAt") { const f = await quadFile(step.name, step.w, step.h, step.type); lastAdd = await addPhotoAtPoint(f, step.sec, step.cx, step.cy); }
  else if (step.act === "addTextCentered") { const cx = SPEC.DESIGN_W[state.device] / 2; const gg = geometry(); const cy = (gg["F_b0"] ? gg["F_b0"].y + gg["F_b0"].h / 2 : 300); const id = addTextAtPoint(step.sec || "feature", cx, cy); lastAdd = id; if (step.text != null) { const n = elNode(id); if (n) { n.focus(); document.execCommand("selectAll", false); document.execCommand("insertText", false, step.text); reconcileEdit(); } } commitEdit(); }
  else if (step.act === "bright") { if (step.id) selectMany([canonId(step.id)]); setBrightness(step.id, step.v); }
  else if (step.act === "brightCard") { setBrightness("card_photo_" + step.cardId, step.v); }
  else if (step.act === "unclearPhoto") { commit({ t: "unclear", id: step.id }); }
  else if (step.act === "moveAdded") { if (lastAdd) { selectMany([lastAdd]); const gg = geometry(); programMove([lastAdd], () => ({ x: gg[lastAdd].x + step.by[0], y: gg[lastAdd].y + step.by[1] })); } }
  else if (step.act === "moveAddedBelow") { if (lastAdd) { selectMany([lastAdd]); const gg = geometry(); const r = gg[step.ref]; if (r) programMove([lastAdd], () => ({ x: r.x, y: r.y + r.h + (step.gap != null ? step.gap : 24) })); } }   // §18 L7/L9/L10
  else if (step.act === "deleteSel") { if (step.id) selectMany([canonId(step.id)]); else if (step.sel === "lastAdd" && lastAdd) selectMany([lastAdd]); deleteSelected(); }
  else if (step.act === "fingerOnly") { if (typeof console !== "undefined") console.log("指の操作のため再現なし"); }
}
function addTextAtSilent(markerId, gap, text) { const g = geometry(); const a = g[markerId]; const id = "add_" + (++state.addSeq); const w = state.device === "pc" ? 600 : 351; commit({ t: "add", id, section: secOf(markerId), kind: "text", styleName: "featBody", w, text, anchor: markerId, gap: gap ?? 24, placedDevice: state.device, x: a.x }); }
// ボタン/プリセット用：目標位置へ動かす（M1/M2/並び替えは c3-edit が判定。付いていく先は離した瞬間 g2 で決める＝§2.2）
// opts.snap=true で §2 の吸い付きを効かせる（Z プリセット用。本物のマウスは dragMove が吸い付く）
function programMove(ids, targetOf, opts) {
  opts = opts || {};
  ids = ids.map(canonId); state.selected = new Set(ids); render();
  const g = geometry(); const prior = reduce(activeOps()).m1;   // 既に M1 の部品を更に動かすときは積む
  for (const id of ids) { const n = elNode(id); const tg = targetOf(id, ids.indexOf(id)); if (n) n.style.transform = `translate(${tg.x - g[id].x}px,${tg.y - g[id].y}px)`; }
  let g2 = geometry();   // 離した瞬間（詰める前）
  if (opts.snap && ids.length === 1) { const id = ids[0]; const e = g2[id]; const ro0 = reorderPreview(g2, id, g);
    if (e) { const snap = snapBox(secOf(id), e, true, !ro0, new Set([id])); if (snap.dx || snap.dy) { const n = elNode(id); const tg = targetOf(id, 0); if (n) n.style.transform = `translate(${tg.x - g[id].x + snap.dx}px,${tg.y - g[id].y + snap.dy}px)`; g2 = geometry(); } } }
  if (ids.length === 1 && !opts.noReorder) { const roReal = reorderPreview(g2, ids[0], g); if (roReal) { commit({ t: "reorder", device: state.device, key: roReal.key, id: ids[0], order: roReal.order }); return; } if (reorderActive(g2, ids[0], g)) { render(); return; } }   // §22a X29：M1(40px内)が先・順が変われば reorder・縁の no-op は流れに戻す（§27 配置は noReorder＝並び替えにしない）
  const m1Of = (d) => ({ id: d.id, mode: "M1", dx: Math.round((prior[d.id]?.dx || 0) + g2[d.id].x - g[d.id].x), dy: Math.round((prior[d.id]?.dy || 0) + g2[d.id].y - g[d.id].y) });
  const decided = ids.map((id) => { const m = isAdded(id) ? "M2" : classifyDropX(g2, id, ids, g); return { id, mode: (m === "M2" && isFlowOnly(id)) ? "M1" : m }; });   // PC-2・SP-1
  if (decided.some((d) => d.mode === "M2")) {
    const finalItems = decided.map((d) => d.mode === "M1"
      ? m1Of(d)
      : (() => { const pr = reanchorX(g2, d.id); return { id: d.id, mode: "M2", anchor: pr.anchor, gapY: pr.gapY, x: pr.x }; })());
    commit({ t: "move", device: state.device, items: finalItems });
    for (const d of finalItems) if (d.mode === "M2" && isAdded(d.id)) pushDownClear(d.id);
  } else {
    commit({ t: "move", device: state.device, items: decided.map(m1Of) });
  }
}
