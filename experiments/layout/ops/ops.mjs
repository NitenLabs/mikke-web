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
    edits: () => ({ move: { F_b0: { dx: 595, dy: 150 } } }),
    note: "本文を写真の下へ move（判定は人）。跡・そろい・重なりを見る" },
  E3: { section: "items", scenario: null, showOnly: false,
    edits: () => ({ template: { cardPhotoH: { pc: 320, sp: 264 } } }),
    note: "カード写真高さ editRow(426→320／351→264)。3枚に効く・価格そろい・以下が上がる" },
  E4: { section: "items", scenario: "S4", showOnly: true,
    edits: (device) => ({ addText: { x: device === "pc" ? 56 : 20, y: device === "pc" ? 988 : 1727, w: device === "pc" ? 600 : 351, gap: 24, text: "季節により品が替わります" } }),
    note: "区切り線の下に文字を add→カード4件(S4)（判定は人）。足した文字がどこへ行くか" },
  E5: { section: "feature", scenario: null, showOnly: true,
    edits: () => ({ remove: ["F_p1"] }),
    note: "ブロック2の写真を remove（判定は人）。文字の置き場所・穴・高さ" },
  E6: { section: "feature", scenario: null, showOnly: false,
    edits: () => ({ move: { F_h0: { dx: 12, dy: 8 } }, pcOnly: true }),
    note: "E1 の move を PC だけ。SP の全要素が base と同じ(±0.5)" },
  E7: { section: "feature", scenario: null, showOnly: false,
    edits: () => ({}),
    note: "E1+E2 の後 reset＝override を消す。全要素が G1 と同じ(±0.5)" },
  E8: { section: "feature", scenario: null, showOnly: false,
    edits: () => ({ move: { F_h0: { dx: 12, dy: 8 } }, template: { headBody: 24 } }),
    note: "E1 後にテンプレの見出し-本文間隔を16→24。見出しの手動は残る・本文は24" },
};
