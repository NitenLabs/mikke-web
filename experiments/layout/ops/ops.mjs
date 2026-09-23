// 付録C（編集を想定した試験）。操作を「画面上で何をしたか」で定義し、各方式が自分のデータに翻訳する。
// edits の形（両方式が読む）:
//   move:{id:{dx,dy}}         ずらし（方式A=相対オフセット／方式B=基準の間隔に加算＝下が追従）
//   remove:[id]               消す（方式A=省く／方式B=基準を引き継ぐ）
//   template:{headBody, cardPhotoH:{pc,sp}}  テンプレート側の変更（全体に効く）
//   addText:{x,y,w,gap,text}  add（方式A=絶対座標で流れに入らない／方式B=すぐ上に基準）
//   pcOnly:true               PC だけに適用（SP は base）
// 各 op: { section, scenario?, edits(device)->edits, showOnly?, note }

export const OPS = {
  E1: { section: "feature", scenario: "S1", showOnly: false,
    edits: () => ({ move: { F_h0: { dx: 12, dy: 8 } } }),
    note: "見出しを move(右12・下8)＋本文3行増(S1)。見出しが本文・写真と重ならないか／SP不変" },
  E2: { section: "feature", scenario: null, showOnly: true,
    // 本文を写真の下へ move（塊の外）。目印＝写真 F_p0。落とし先 x755・写真下端+24。
    edits: () => ({ moveOut: { F_b0: { marker: "F_p0", gap: 24, x: 755, dropY: 763 } } }),
    note: "本文を写真の下へ move（塊の外・判定は人）。A=絶対で跡詰まる／B=写真に再基準／C=写真直後に付く" },
  E3: { section: "items", scenario: null, showOnly: false,
    edits: () => ({ template: { cardPhotoH: { pc: 320, sp: 264 } } }),
    note: "カード写真高さ editRow(426→320／351→264)。3枚に効く・価格そろい・以下が上がる" },
  E4: { section: "items", scenario: "S4", showOnly: true,
    edits: (device) => ({ addText: { marker: "I_divider", x: device === "pc" ? 56 : 20, y: device === "pc" ? 988 : 1727, w: device === "pc" ? 600 : 351, gap: 24, text: "季節により品が替わります" } }),
    note: "区切り線の下に文字を add→カード4件(S4)（判定は人）。A=絶対で留まる／B・C=区切り線に付いて下がる" },
  E5: { section: "feature", scenario: null, showOnly: true,
    edits: () => ({ remove: ["F_p1"] }),
    note: "ブロック2の写真を remove（判定は人）。文字の置き場所・穴・高さ" },
  E6: { section: "feature", scenario: null, showOnly: false,
    edits: () => ({ move: { F_h0: { dx: 12, dy: 8 } }, pcOnly: true }),
    note: "E1 の move を PC だけ。SP の全要素が base と同じ(±0.5)" },
  E7: { section: "feature", scenario: null, showOnly: false,
    edits: () => ({}),
    note: "E1+E2 の後 reset＝override を消す。全要素が G1 と同じ(±0.5)" },
  E8: { section: "feature", scenario: null, showOnly: true,
    edits: () => ({ move: { F_h0: { dx: 12, dy: 8 } }, template: { headBody: 24 } }),
    note: "E1(見出し move) 後にテンプレの見出し-本文間隔を16→24（見せる）。見出しの見た目の下端→本文の上端の距離を3方式で報告" },
};
