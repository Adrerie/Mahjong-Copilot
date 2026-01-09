
import { Suit, Tile, Language } from './types';

export const MAX_TILES_IN_HAND = 14; 
export const INITIAL_WALL_MCR = 83;
export const INITIAL_WALL_SICHUAN = 55;

export const THEME = {
  primary: '#CCFF00', // Acid Lime
  primaryBorder: '#000000',
  secondary: '#FF006E', // Hot Pink
  bgGradient: 'from-[#F0F8FF] to-white',
  textMain: '#1A237E', // Deep Navy
  textBody: '#37474F', // Dark Grey
  cardBg: '#FFFFFF',
};

// Text Dictionary
export const TEXT = {
  en: {
    mcr: 'Chinese Official',
    sichuan: 'Sichuan Blood',
    mcrDesc: 'National Standard • 81 Fan',
    sichuanDesc: 'Blood Battle • Void Suit',
    wallTiles: 'Wall',
    voidSuit: 'Void',
    hand: 'Hand',
    melds: 'Melds',
    discards: 'River',
    reset: 'Reset',
    analyze: 'Analyze',
    editing: 'Editing',
    modes: 'Modes',
    ready: 'READY',
    shanten: 'Shanten',
    recDiscard: 'Best Discard',
    discardHint: 'Discard this to improve efficiency',
    waits: 'Waiting Tiles',
    left: 'Left',
    prob: 'Prob',
    score: 'Est. Score',
    fan: 'Fan',
    handFull: 'Hand is full!',
    maxTile: 'Cannot add more of this tile',
    resetConfirm: 'Clear all tiles?',
    backToGame: 'Back to Game',
    man: 'Wan',
    pin: 'Tong',
    sou: 'Tiao',
    zi: 'Zi',
    emptyHand: 'Tap keyboard below to add tiles...',
    emptyMelds: 'Add melds...',
    emptyRiver: 'Add discards...',
    addingTo: 'Adding to',
    removeHint: 'Tap to remove',
    analysisTitle: 'Analysis Report',
    handArea: 'My Tiles',
    targetPatterns: 'Target Patterns',
    missing: 'Missing',
    efficiency: 'Efficiency',
    totalFan: 'Total',
    // MCR Patterns
    fan88: '88 Fan',
    fan64: '64 Fan',
    fan48: '48 Fan',
    fan32: '32 Fan',
    fan24: '24 Fan',
    fan16: '16 Fan',
    fan12: '12 Fan',
    fan8: '8 Fan',
    fan6: '6 Fan',
    fan4: '4 Fan',
    fan2: '2 Fan',
    fan1: '1 Fan',
    // Specific Pattern Names (EN)
    thirteenOrphans: 'Thirteen Orphans',
    bigFourWinds: 'Big Four Winds',
    bigThreeDragons: 'Big Three Dragons',
    allGreen: 'All Green',
    nineGates: 'Nine Gates',
    allHonors: 'All Honors',
    smallFourWinds: 'Little Four Winds',
    smallThreeDragons: 'Little Three Dragons',
    pureTerminal: 'All Terminals',
    fullFlush: 'Full Flush',
    sevenPairs: 'Seven Pairs',
    pureStraight: 'Pure Straight',
    mixedOneSuit: 'Mixed One Suit',
    allPungs: 'All Pungs',
    fourConcealedPungs: 'Four Concealed Pungs',
    quadrupleChow: 'Quadruple Chow', // Yi Se Si Tong Shun 48番
    fourPureShiftedPungs: 'Four Pure Shifted Pungs', // Yi Se Si Jie Gao 48番
    mixedTripleChow: 'Mixed Triple Chow', // San Se San Tong Shun
    pureTripleChow: 'Pure Triple Chow', // Yi Se San Tong Shun
    pureShiftedPungs: 'Pure Shifted Pungs', // Yi Se San Jie Gao
    pureShiftedChows: 'Pure Shifted Chows', // Yi Se San Bu Gao
    mixedShiftedChows: 'Mixed Shifted Chows', // San Se San Bu Gao
    fiveGates: 'Five Types', // Wu Men Qi
    mixedShiftedPungs: 'Mixed Shifted Pungs',
    triplePung: 'Triple Pung', // San Tong Ke
    mixedStraight: 'Mixed Straight', // Hua Long
    allSimples: 'All Simples',
    noHonors: 'No Honors',
    pureDoubleChow: 'Pure Double Chow', // Yi Ban Gao
    shortStraight: 'Short Straight', // Lian Liu
    twoTerminalChows: 'Two Terminal Chows', // Lao Shao Fu
    terminalsChows: 'Terminals & Chows', // Quan Dai Yao
    lastTileDraw: 'Last Tile Draw',
    lastTileClaim: 'Last Tile Claim',
    lastTileHint: 'Wall nearly empty - last tile bonus possible!',
    // Sichuan (成都玩法)
    pingHu: 'Basic Win',  // 基本和/鸡和 1番
    menQianQing: 'Concealed Hand', // 门前清 2番 (仅自摸)
    duanYaoJiu: 'All Simples', // 断幺九 2番
    duiDuiHu: 'All Pungs', // 对对胡 2番
    daiYaoJiu: 'All Terminals & Honors', // 带幺九 4番
    qingYiSe: 'Full Flush', // 清一色 4番
    jinGouDiao: 'Single Wait', // 金钩钓 4番
    qiDui: 'Seven Pairs', // 七对 4番
    longQiDui: 'Seven Pairs + Root', // 龙七对 (七对+根)
    jiangDui: 'All 258 Pungs', // 将对 8番 (只用2,5,8的对对和)
    qingDui: 'Pure Pungs', // 清对 8番 (清一色+对对和)
    qingYaoJiu: 'Pure Terminals', // 清幺九 16番
    qingJinGou: 'Pure Single Wait', // 清金钩钓 16番
    qingQiDui: 'Pure Seven Pairs', // 清七对 16番
    qingLongQiDui: 'Pure Dragon Seven Pairs', // 清龙七对
    tianHu: 'Heavenly Win', // 天和 64番封顶
    diHu: 'Earthly Win', // 地和 32番
    root: 'Root', // 根 (+1根)
    ziMo: 'Self-Draw', // 自摸 (+1番或+1根)
    gangShangHua: 'Win on Kong', // 杠上开花 (+1根)
    gangShangPao: 'Rob from Kong Discard', // 杠上炮 (+1根)
    qiangGang: 'Robbing the Kong', // 抢杠 (+1根)
    haiDi: 'Last Tile', // 海底捞月 (+1根)
    heJueZhang: 'Win on Last Tile', // 和绝张 (+1根)
    huaZhu: 'Flower Pig', // 花猪 (有缺未打)
    illegal: 'Illegal'
  },
  zh: {
    mcr: '国标麻将',
    sichuan: '四川血战',
    mcrDesc: '81番 • 竞技标准',
    sichuanDesc: '血战到底 • 缺一门',
    wallTiles: '牌墙',
    voidSuit: '定缺',
    hand: '手牌',
    melds: '副露',
    discards: '牌河',
    reset: '重置',
    analyze: '分析',
    editing: '输入中',
    modes: '模式',
    ready: '听牌',
    shanten: '向听',
    recDiscard: '最优弃牌',
    discardHint: '打出此牌进张面最广',
    waits: '听牌列表',
    left: '剩余',
    prob: '概率',
    score: '预估番数',
    fan: '番',
    handFull: '手牌已满！',
    maxTile: '牌张数已达上限',
    resetConfirm: '清空所有输入？',
    backToGame: '返回',
    man: '万',
    pin: '筒',
    sou: '条',
    zi: '字',
    emptyHand: '点击下方键盘添加手牌...',
    emptyMelds: '添加碰/杠...',
    emptyRiver: '添加打出的牌...',
    addingTo: '当前输入',
    removeHint: '点击删除',
    analysisTitle: '分析报告',
    handArea: '我的牌',
    targetPatterns: '番种建议',
    missing: '缺少',
    efficiency: '进张效率',
    totalFan: '总计',
    // MCR Patterns (Selection)
    fan88: '88番',
    fan64: '64番',
    fan48: '48番',
    fan32: '32番',
    fan24: '24番',
    fan16: '16番',
    fan12: '12番',
    fan8: '8番',
    fan6: '6番',
    fan4: '4番',
    fan2: '2番',
    fan1: '1番',
    // Specific Pattern Names (ZH)
    thirteenOrphans: '十三幺',
    bigFourWinds: '大四喜',
    bigThreeDragons: '大三元',
    allGreen: '绿一色',
    nineGates: '九莲宝灯',
    allHonors: '字一色',
    smallFourWinds: '小四喜',
    smallThreeDragons: '小三元',
    pureTerminal: '清幺九',
    fullFlush: '清一色',
    sevenPairs: '七对',
    pureStraight: '清龙',
    mixedOneSuit: '混一色',
    allPungs: '碰碰和',
    fourConcealedPungs: '四暗刻',
    quadrupleChow: '一色四同顺', // 48番
    fourPureShiftedPungs: '一色四节高', // 48番
    mixedTripleChow: '三色三同顺',
    pureTripleChow: '一色三同顺',
    pureShiftedPungs: '一色三节高',
    pureShiftedChows: '一色三步高',
    mixedShiftedChows: '三色三步高',
    fiveGates: '五门齐',
    mixedShiftedPungs: '三色三节高',
    triplePung: '三同刻',
    mixedStraight: '花龙',
    allSimples: '断幺',
    noHonors: '无字',
    pureDoubleChow: '一般高',
    shortStraight: '连六',
    twoTerminalChows: '老少副',
    terminalsChows: '全带幺',
    lastTileDraw: '妙手回春',
    lastTileClaim: '海底捞月',
    lastTileHint: '牌墙将尽，可能获得海底番！',
    // Sichuan (成都玩法)
    pingHu: '基本和', // 1番 (无番和/鸡和)
    menQianQing: '门前清', // 2番 (仅自摸成立)
    duanYaoJiu: '断幺九', // 2番
    duiDuiHu: '对对胡', // 2番
    daiYaoJiu: '带幺九', // 4番
    qingYiSe: '清一色', // 4番
    jinGouDiao: '金钩钓', // 4番
    qiDui: '七对', // 4番
    longQiDui: '龙七对', // 七对+根
    jiangDui: '将对', // 8番 (只用2,5,8)
    qingDui: '清对', // 8番 (清一色+对对和)
    qingYaoJiu: '清幺九', // 16番
    qingJinGou: '清金钩钓', // 16番
    qingQiDui: '清七对', // 16番
    qingLongQiDui: '清龙七对', // 清一色+龙七对
    tianHu: '天和', // 64番封顶
    diHu: '地和', // 32番
    root: '根', // +1根
    ziMo: '自摸', // +1番或+1根
    gangShangHua: '杠上开花', // +1根
    gangShangPao: '杠上炮', // +1根
    qiangGang: '抢杠', // +1根
    haiDi: '海底捞月', // +1根
    heJueZhang: '和绝张', // +1根
    huaZhu: '花猪', // 有缺未打
    illegal: '无法和牌',
  }
};

export const SUIT_LABELS: Record<Language, Record<Suit, string>> = {
  en: {
    [Suit.Man]: 'Wan',
    [Suit.Pin]: 'Pin',
    [Suit.Sou]: 'Sou',
    [Suit.Zihai]: 'Honors',
  },
  zh: {
    [Suit.Man]: '万',
    [Suit.Pin]: '筒',
    [Suit.Sou]: '条',
    [Suit.Zihai]: '字',
  }
};

// ============================================================
// 国标麻将 MCR (Chinese Official) - 81 番种定义
// 参考: https://zh.wikipedia.org/wiki/国标麻将番种列表
// ============================================================

export interface MCRPattern {
  id: string;
  nameZh: string;
  nameEn: string;
  fan: number;
  description: string;
  excludes: string[]; // 不计 - 包含此番型时，这些番不再计算
  includes?: string[]; // 另计 - 即使满足不计条件，这些番仍然单独计算
}

// 88番 (Top Tier)
export const MCR_88_FAN: MCRPattern[] = [
  { id: 'daSiXi', nameZh: '大四喜', nameEn: 'Big Four Winds', fan: 88, description: '和牌时4副风刻(杠)', excludes: ['xiaoSiXi', 'sanFengKe', 'pengPengHu', 'quanFengKe', 'menFengKe', 'yaoJiuKe'], includes: ['hunYaoJiu', 'hunYiSe', 'ziYiSe'] },
  { id: 'daSanYuan', nameZh: '大三元', nameEn: 'Big Three Dragons', fan: 88, description: '和牌时3副箭刻(杠)', excludes: ['xiaoSanYuan', 'jianKe', 'shuangJianKe'], includes: ['quanDaiYao', 'ziYiSe'] },
  { id: 'lvYiSe', nameZh: '绿一色', nameEn: 'All Green', fan: 88, description: '由23468条及发财组成的和牌', excludes: ['hunYiSe', 'qingYiSe'], includes: ['siGuiYi', 'jianKe', 'qingYiSe', 'yiSeSanJieGao', 'pengPengHu', 'duanYao'] },
  { id: 'jiuLianBaoDeng', nameZh: '九莲宝灯', nameEn: 'Nine Gates', fan: 88, description: '门前清时特定牌型1112345678999+任意同花色牌', excludes: ['qingYiSe', 'menQianQing', 'buQiuRen', 'yaoJiuKe'], includes: ['siGuiYi', 'qingLong', 'shuangAnKe', 'lianLiu'] },
  { id: 'siGang', nameZh: '四杠', nameEn: 'Four Kongs', fan: 88, description: '和牌时4个杠', excludes: ['sanGang', 'shuangMingGang', 'shuangAnGang', 'mingGang', 'danDiaoJiang', 'pengPengHu'], includes: ['siAnKe', 'quanDa', 'sanSeSanJieGao', 'shuangTongKe', 'yaoJiuKe', 'hunYaoJiu', 'sanTongKe', 'wuMenQi', 'jianKe'] },
  { id: 'lianQiDui', nameZh: '连七对', nameEn: 'Seven Shifted Pairs', fan: 88, description: '由一种花色序数牌组成的7个连续对子', excludes: ['qingYiSe', 'qiDui', 'menQianQing', 'buQiuRen', 'pingHu', 'danDiaoJiang'], includes: ['duanYao'] },
  { id: 'shiSanYao', nameZh: '十三幺', nameEn: 'Thirteen Orphans', fan: 88, description: '由全部幺九牌及字牌各一张组成,另有一张重复', excludes: ['wuMenQi', 'menQianQing', 'buQiuRen', 'danDiaoJiang', 'hunYaoJiu'] },
];

// 64番
export const MCR_64_FAN: MCRPattern[] = [
  { id: 'qingYaoJiu', nameZh: '清幺九', nameEn: 'All Terminals', fan: 64, description: '由序数牌一、九组成的刻子和牌', excludes: ['pengPengHu', 'hunYaoJiu', 'shuangTongKe', 'wuZi', 'yaoJiuKe'], includes: ['qiDui', 'siGuiYi'] },
  { id: 'xiaoSiXi', nameZh: '小四喜', nameEn: 'Little Four Winds', fan: 64, description: '和牌时3副风刻(杠)加1对风将', excludes: ['sanFengKe', 'yaoJiuKe'], includes: ['pengPengHu'] },
  { id: 'xiaoSanYuan', nameZh: '小三元', nameEn: 'Little Three Dragons', fan: 64, description: '和牌时2副箭刻(杠)加1对箭将', excludes: ['shuangJianKe', 'jianKe', 'queYiMen'], includes: ['hunYaoJiu', 'shuangTongKe'] },
  { id: 'ziYiSe', nameZh: '字一色', nameEn: 'All Honors', fan: 64, description: '由字牌组成的和牌', excludes: ['pengPengHu', 'hunYaoJiu', 'yaoJiuKe'], includes: ['shuangJianKe'] },
  { id: 'siAnKe', nameZh: '四暗刻', nameEn: 'Four Concealed Pungs', fan: 64, description: '4个暗刻(杠)', excludes: ['pengPengHu', 'menQianQing', 'buQiuRen', 'shuangAnGang', 'sanAnKe', 'shuangAnKe'] },
  { id: 'yiSeShuangLongHui', nameZh: '一色双龙会', nameEn: 'Pure Terminal Chows', fan: 64, description: '由一种花色的123、789各两组及5作将组成', excludes: ['qingYiSe', 'pingHu', 'yiBanGao', 'laoShaoFu', 'wuZi', 'queYiMen'] },
];

// 48番
export const MCR_48_FAN: MCRPattern[] = [
  { id: 'yiSeSiTongShun', nameZh: '一色四同顺', nameEn: 'Quadruple Chow', fan: 48, description: '一种花色4组相同序数的顺子', excludes: ['yiSeSanTongShun', 'yiBanGao', 'siGuiYi'], includes: ['lvYiSe', 'qingYiSe', 'duanYao', 'pingHu'] },
  { id: 'yiSeSiJieGao', nameZh: '一色四节高', nameEn: 'Four Pure Shifted Pungs', fan: 48, description: '一种花色4个依次递增1的刻子', excludes: ['yiSeSanJieGao', 'pengPengHu'], includes: ['tuiBuDao', 'xiaoYuWu', 'yaoJiuKe'] },
];

// 32番
export const MCR_32_FAN: MCRPattern[] = [
  { id: 'yiSeSiBuGao', nameZh: '一色四步高', nameEn: 'Four Shifted Chows', fan: 32, description: '一种花色4组依次递增1或2的顺子', excludes: ['yiSeSanBuGao', 'lianLiu'], includes: ['hunYiSe', 'pingHu'] },
  { id: 'sanGang', nameZh: '三杠', nameEn: 'Three Kongs', fan: 32, description: '3个杠', excludes: ['shuangMingGang', 'shuangAnGang', 'mingGang'], includes: ['xiaoYuWu', 'sanSeSanJieGao'] },
  { id: 'hunYaoJiu', nameZh: '混幺九', nameEn: 'All Terminals and Honors', fan: 32, description: '由幺九牌和字牌组成的和牌', excludes: ['pengPengHu', 'quanDaiYao', 'yaoJiuKe'], includes: ['sanTongKe', 'jianKe', 'wuMenQi', 'qiDui', 'siGuiYi', 'queYiMen'] },
];

// 24番
export const MCR_24_FAN: MCRPattern[] = [
  { id: 'qiDui', nameZh: '七对', nameEn: 'Seven Pairs', fan: 24, description: '由7个对子组成的和牌', excludes: ['menQianQing', 'buQiuRen', 'danDiaoJiang'], includes: ['wuMenQi', 'lvYiSe', 'qingYiSe', 'quanShuangKe', 'tuiBuDao'] },
  { id: 'qiXingBuKao', nameZh: '七星不靠', nameEn: 'Greater Honors and Knitted Tiles', fan: 24, description: '7个单张的东南西北中发白加3种花色不相邻的7张序数牌', excludes: ['quanBuKao', 'wuMenQi', 'menQianQing', 'buQiuRen', 'danDiaoJiang'] },
  { id: 'quanShuangKe', nameZh: '全双刻', nameEn: 'All Even Pungs', fan: 24, description: '由2、4、6、8序数牌组成的刻子和牌', excludes: ['pengPengHu', 'duanYao'], includes: ['tuiBuDao', 'shuangTongKe'] },
  { id: 'qingYiSe', nameZh: '清一色', nameEn: 'Full Flush', fan: 24, description: '由同一种花色序数牌组成的和牌', excludes: ['wuZi'], includes: ['qingLong', 'yiBanGao', 'siGuiYi', 'pingHu'] },
  { id: 'yiSeSanTongShun', nameZh: '一色三同顺', nameEn: 'Pure Triple Chow', fan: 24, description: '一种花色3组相同序数的顺子', excludes: ['yiBanGao'], includes: ['quanXiao', 'quanDaiYao', 'pingHu', 'queYiMen', 'xiXiangFeng'] },
  { id: 'yiSeSanJieGao', nameZh: '一色三节高', nameEn: 'Pure Shifted Pungs', fan: 24, description: '一种花色3个依次递增1的刻子', excludes: [], includes: ['hunYiSe', 'siGuiYi'] },
  { id: 'quanDa', nameZh: '全大', nameEn: 'Upper Tiles', fan: 24, description: '由789组成的和牌', excludes: ['wuZi', 'daYuWu'], includes: ['sanSeSanTongShun', 'quanDaiYao', 'pingHu', 'yiBanGao'] },
  { id: 'quanZhong', nameZh: '全中', nameEn: 'Middle Tiles', fan: 24, description: '由456组成的和牌', excludes: ['wuZi', 'duanYao'], includes: ['pengPengHu', 'sanSeSanJieGao', 'shuangTongKe'] },
  { id: 'quanXiao', nameZh: '全小', nameEn: 'Lower Tiles', fan: 24, description: '由123组成的和牌', excludes: ['wuZi', 'xiaoYuWu'], includes: ['yiSeSiTongShun', 'quanDaiYao', 'queYiMen', 'pingHu'] },
];

// 16番
export const MCR_16_FAN: MCRPattern[] = [
  { id: 'qingLong', nameZh: '清龙', nameEn: 'Pure Straight', fan: 16, description: '同一种花色123、456、789的顺子', excludes: ['lianLiu', 'laoShaoFu'], includes: ['pingHu', 'queYiMen', 'xiXiangFeng'] },
  { id: 'sanSeShuangLongHui', nameZh: '三色双龙会', nameEn: 'Three-Suited Terminal Chows', fan: 16, description: '两种花色的123、789各一副加第三种花色5作将', excludes: ['pingHu', 'laoShaoFu', 'wuZi', 'xiXiangFeng'] },
  { id: 'yiSeSanBuGao', nameZh: '一色三步高', nameEn: 'Pure Shifted Chows', fan: 16, description: '一种花色3组依次递增1或2的顺子', excludes: [], includes: ['quanDaiWu', 'pingHu', 'xiXiangFeng'] },
  { id: 'quanDaiWu', nameZh: '全带五', nameEn: 'All Fives', fan: 16, description: '每副牌及将牌都有5的序数牌', excludes: ['duanYao'], includes: ['quanZhong', 'sanSeSanTongShun', 'siGuiYi', 'pingHu', 'yiBanGao'] },
  { id: 'sanTongKe', nameZh: '三同刻', nameEn: 'Triple Pung', fan: 16, description: '3种花色3个相同序数的刻子', excludes: [], includes: ['quanShuangKe', 'quanZhong'] },
  { id: 'sanAnKe', nameZh: '三暗刻', nameEn: 'Three Concealed Pungs', fan: 16, description: '3个暗刻', excludes: ['shuangAnKe'] },
];

// 12番
export const MCR_12_FAN: MCRPattern[] = [
  { id: 'quanBuKao', nameZh: '全不靠', nameEn: 'Lesser Honors and Knitted Tiles', fan: 12, description: '由单张3种花色序数牌147、258、369不能相邻及孤张字牌组成', excludes: ['wuMenQi', 'menQianQing', 'buQiuRen', 'danDiaoJiang'], includes: ['zuHeLong'] },
  { id: 'zuHeLong', nameZh: '组合龙', nameEn: 'Knitted Straight', fan: 12, description: '3种花色的147、258、369组合成龙', excludes: [], includes: ['pingHu', 'wuMenQi', 'jianKe'] },
  { id: 'daYuWu', nameZh: '大于五', nameEn: 'Upper Four', fan: 12, description: '由6789组成的和牌', excludes: ['wuZi'], includes: ['sanSeSanTongShun', 'yiBanGao', 'pingHu'] },
  { id: 'xiaoYuWu', nameZh: '小于五', nameEn: 'Lower Four', fan: 12, description: '由1234组成的和牌', excludes: ['wuZi'], includes: ['qingYiSe', 'yiSeSanJieGao', 'tuiBuDao', 'siGuiYi'] },
  { id: 'sanFengKe', nameZh: '三风刻', nameEn: 'Big Three Winds', fan: 12, description: '3副风刻(杠)', excludes: ['yaoJiuKe'], includes: ['ziYiSe', 'jianKe'] },
];

// 8番 (起和线 - Minimum for MCR)
export const MCR_8_FAN: MCRPattern[] = [
  { id: 'huaLong', nameZh: '花龙', nameEn: 'Mixed Straight', fan: 8, description: '3种花色的3组顺子连成1到9', excludes: [], includes: ['yiBanGao', 'pingHu'] },
  { id: 'tuiBuDao', nameZh: '推不倒', nameEn: 'Reversible Tiles', fan: 8, description: '由1234589筒、245689条、白板组成的和牌', excludes: ['queYiMen'], includes: ['shuangTongKe', 'wuZi', 'yaoJiuKe', 'qingYiSe', 'qiDui'] },
  { id: 'sanSeSanTongShun', nameZh: '三色三同顺', nameEn: 'Mixed Triple Chow', fan: 8, description: '3种花色相同序数的顺子', excludes: ['xiXiangFeng'], includes: ['pingHu', 'lianLiu'] },
  { id: 'sanSeSanJieGao', nameZh: '三色三节高', nameEn: 'Mixed Shifted Pungs', fan: 8, description: '3种花色依次递增1的刻子', excludes: [], includes: ['quanDa', 'pengPengHu', 'shuangTongKe', 'yaoJiuKe'] },
  { id: 'wuFanHu', nameZh: '无番和', nameEn: 'Chicken Hand', fan: 8, description: '除门前清和自摸外无其他番种', excludes: [] },
  { id: 'miaoShouHuiChun', nameZh: '妙手回春', nameEn: 'Last Tile Draw', fan: 8, description: '自摸牌墙上最后一张牌和牌', excludes: ['ziMo'] },
  { id: 'haiDiLaoYue', nameZh: '海底捞月', nameEn: 'Last Tile Claim', fan: 8, description: '和别家打出的牌墙上最后一张牌', excludes: [] },
  { id: 'gangShangKaiHua', nameZh: '杠上开花', nameEn: 'Out with Replacement Tile', fan: 8, description: '开杠后补进的牌自摸和牌', excludes: ['ziMo'] },
  { id: 'qiangGangHu', nameZh: '抢杠和', nameEn: 'Robbing the Kong', fan: 8, description: '和别家加杠的牌', excludes: ['heJueZhang'] },
];

// 6番
export const MCR_6_FAN: MCRPattern[] = [
  { id: 'pengPengHu', nameZh: '碰碰和', nameEn: 'All Pungs', fan: 6, description: '由4副刻子(杠)组成的和牌', excludes: [], includes: ['yiSeSanJieGao', 'shuangTongKe', 'tuiBuDao'] },
  { id: 'hunYiSe', nameZh: '混一色', nameEn: 'Half Flush', fan: 6, description: '由一种花色序数牌及字牌组成的和牌', excludes: [], includes: ['jianKe', 'laoShaoFu'] },
  { id: 'sanSeSanBuGao', nameZh: '三色三步高', nameEn: 'Mixed Shifted Chows', fan: 6, description: '3种花色依次递增1的顺子', excludes: [], includes: ['quanDaiWu', 'siGuiYi'] },
  { id: 'wuMenQi', nameZh: '五门齐', nameEn: 'All Types', fan: 6, description: '和牌时万、筒、条、风、箭全有', excludes: [], includes: ['quanDaiYao', 'jianKe', 'xiXiangFeng'] },
  { id: 'quanQiuRen', nameZh: '全求人', nameEn: 'Melded Hand', fan: 6, description: '4副全部吃碰明杠，和别家打出的牌', excludes: ['danDiaoJiang'] },
  { id: 'shuangAnGang', nameZh: '双暗杠', nameEn: 'Two Concealed Kongs', fan: 6, description: '2个暗杠', excludes: [] },
  { id: 'shuangJianKe', nameZh: '双箭刻', nameEn: 'Two Dragon Pungs', fan: 6, description: '2副箭刻(杠)', excludes: [] },
];

// 4番
export const MCR_4_FAN: MCRPattern[] = [
  { id: 'quanDaiYao', nameZh: '全带幺', nameEn: 'Outside Hand', fan: 4, description: '每副牌及将牌都有幺九牌或字牌', excludes: [] },
  { id: 'buQiuRen', nameZh: '不求人', nameEn: 'Fully Concealed Hand', fan: 4, description: '门前清自摸和牌', excludes: ['menQianQing', 'ziMo'] },
  { id: 'shuangMingGang', nameZh: '双明杠', nameEn: 'Two Melded Kongs', fan: 4, description: '2个明杠', excludes: [] },
  { id: 'heJueZhang', nameZh: '和绝张', nameEn: 'Last Tile', fan: 4, description: '和牌池及桌面已见三张的第四张牌', excludes: [] },
];

// 2番
export const MCR_2_FAN: MCRPattern[] = [
  { id: 'jianKe', nameZh: '箭刻', nameEn: 'Dragon Pung', fan: 2, description: '中、发、白任意一副刻子(杠)', excludes: [] },
  { id: 'quanFengKe', nameZh: '圈风刻', nameEn: 'Prevalent Wind', fan: 2, description: '与圈风相同的风刻(杠)', excludes: [] },
  { id: 'menFengKe', nameZh: '门风刻', nameEn: 'Seat Wind', fan: 2, description: '与本门风相同的风刻(杠)', excludes: [] },
  { id: 'menQianQing', nameZh: '门前清', nameEn: 'Concealed Hand', fan: 2, description: '没有吃、碰、明杠', excludes: [] },
  { id: 'pingHu', nameZh: '平和', nameEn: 'All Chows', fan: 2, description: '由4组顺子及序数牌作将组成', excludes: ['wuZi'] },
  { id: 'siGuiYi', nameZh: '四归一', nameEn: 'Tile Hog', fan: 2, description: '和牌时4张相同的牌归于一家', excludes: [] },
  { id: 'shuangTongKe', nameZh: '双同刻', nameEn: 'Double Pung', fan: 2, description: '2种花色相同序数的刻子', excludes: [] },
  { id: 'shuangAnKe', nameZh: '双暗刻', nameEn: 'Two Concealed Pungs', fan: 2, description: '2个暗刻', excludes: [] },
  { id: 'duanYao', nameZh: '断幺', nameEn: 'All Simples', fan: 2, description: '和牌时无幺九牌及字牌', excludes: ['wuZi'] },
  { id: 'anGang', nameZh: '暗杠', nameEn: 'Concealed Kong', fan: 2, description: '自摸4张相同的牌开杠', excludes: [] },
];

// 1番
export const MCR_1_FAN: MCRPattern[] = [
  { id: 'yiBanGao', nameZh: '一般高', nameEn: 'Pure Double Chow', fan: 1, description: '同一种花色2组相同序数的顺子', excludes: [] },
  { id: 'xiXiangFeng', nameZh: '喜相逢', nameEn: 'Mixed Double Chow', fan: 1, description: '2种花色相同序数的顺子', excludes: [] },
  { id: 'lianLiu', nameZh: '连六', nameEn: 'Short Straight', fan: 1, description: '同一种花色6张连续的序数牌', excludes: [] },
  { id: 'laoShaoFu', nameZh: '老少副', nameEn: 'Two Terminal Chows', fan: 1, description: '同一种花色123和789两组顺子', excludes: [] },
  { id: 'yaoJiuKe', nameZh: '幺九刻', nameEn: 'Pung of Terminals or Honors', fan: 1, description: '幺九牌或字牌的刻子(杠)', excludes: [] },
  { id: 'mingGang', nameZh: '明杠', nameEn: 'Melded Kong', fan: 1, description: '明杠', excludes: [] },
  { id: 'queYiMen', nameZh: '缺一门', nameEn: 'One Voided Suit', fan: 1, description: '和牌时缺少一种花色序数牌', excludes: [] },
  { id: 'wuZi', nameZh: '无字', nameEn: 'No Honors', fan: 1, description: '和牌时没有字牌', excludes: [] },
  { id: 'bianZhang', nameZh: '边张', nameEn: 'Edge Wait', fan: 1, description: '单听123的3或789的7', excludes: [] },
  { id: 'kanZhang', nameZh: '坎张', nameEn: 'Closed Wait', fan: 1, description: '单听顺子中间一张', excludes: [] },
  { id: 'danDiaoJiang', nameZh: '单钓将', nameEn: 'Single Wait', fan: 1, description: '钓单张将牌', excludes: [] },
  { id: 'ziMo', nameZh: '自摸', nameEn: 'Self-Drawn', fan: 1, description: '自己摸牌和牌', excludes: [] },
  { id: 'huaPai', nameZh: '花牌', nameEn: 'Flower Tiles', fan: 1, description: '每有一张花牌(春夏秋冬梅兰竹菊)加1番', excludes: [] },
];

// 所有国标番种汇总
export const MCR_ALL_PATTERNS = {
  88: MCR_88_FAN,
  64: MCR_64_FAN,
  48: MCR_48_FAN,
  32: MCR_32_FAN,
  24: MCR_24_FAN,
  16: MCR_16_FAN,
  12: MCR_12_FAN,
  8: MCR_8_FAN,
  6: MCR_6_FAN,
  4: MCR_4_FAN,
  2: MCR_2_FAN,
  1: MCR_1_FAN,
};

// 国标麻将核心规则常量
export const MCR_RULES = {
  MIN_FAN_TO_WIN: 8, // 8番起和
  TOTAL_FAN_TYPES: 81, // 81种番型
};

// ============================================================
// 四川麻将 Sichuan (Blood Battle) 番种定义
// 参考: https://zh.wikipedia.org/wiki/四川麻将
// ============================================================

export interface SichuanPattern {
  id: string;
  nameZh: string;
  nameEn: string;
  fan: number; // 番数
  multiplier: number; // 倍数 = 2^fan
  description: string;
  excludes: string[]; // 互斥牌型
}

// 基本牌型 (Base Types)
export const SICHUAN_BASE_PATTERNS: SichuanPattern[] = [
  { id: 'pingHu', nameZh: '平胡', nameEn: 'Ping Hu', fan: 0, multiplier: 1, description: '基本胡牌型，由顺子和将组成', excludes: [] },
  { id: 'duiDuiHu', nameZh: '对对胡', nameEn: 'All Pungs', fan: 2, multiplier: 4, description: '由4个刻子和1对将组成', excludes: ['pingHu'] },
  { id: 'qingYiSe', nameZh: '清一色', nameEn: 'Full Flush', fan: 4, multiplier: 16, description: '整手牌由同一花色组成（部分规则为2-3番）', excludes: [] },
  { id: 'qingDui', nameZh: '清对', nameEn: 'Flush Pungs', fan: 6, multiplier: 64, description: '清一色+对对胡', excludes: ['qingYiSe', 'duiDuiHu'] },
  { id: 'qiDui', nameZh: '七对', nameEn: 'Seven Pairs', fan: 4, multiplier: 16, description: '由7个对子组成', excludes: ['pingHu', 'duiDuiHu'] },
  { id: 'longQiDui', nameZh: '龙七对', nameEn: 'Dragon Seven Pairs', fan: 6, multiplier: 64, description: '七对中含有四张相同的牌（含一根）', excludes: ['qiDui'] },
  { id: 'jinGouDiao', nameZh: '金钩钓', nameEn: 'Golden Hook', fan: 4, multiplier: 16, description: '4个刻子/杠，单钓将', excludes: ['duiDuiHu'] },
  { id: 'daiYaoJiu', nameZh: '带幺九', nameEn: 'With Terminals', fan: 4, multiplier: 16, description: '每副牌都带有1或9（可选规则）', excludes: [] },
  { id: 'jiangDui', nameZh: '将对', nameEn: 'Honor Pungs', fan: 4, multiplier: 16, description: '全部由2、5、8组成的对对胡', excludes: ['duiDuiHu'] },
  { id: 'qingQiDui', nameZh: '清七对', nameEn: 'Pure Seven Pairs', fan: 8, multiplier: 256, description: '清一色+七对', excludes: ['qingYiSe', 'qiDui'] },
  { id: 'qingLongQiDui', nameZh: '清龙七对', nameEn: 'Pure Dragon Seven', fan: 10, multiplier: 1024, description: '清一色+龙七对', excludes: ['qingYiSe', 'longQiDui'] },
  { id: 'qingJinGou', nameZh: '清金钩', nameEn: 'Pure Golden Hook', fan: 8, multiplier: 256, description: '清一色+金钩钓', excludes: ['qingYiSe', 'jinGouDiao'] },
  { id: 'shiSanYao', nameZh: '十三幺', nameEn: 'Thirteen Orphans', fan: 8, multiplier: 256, description: '特殊牌型（部分地区规则）', excludes: [] },
  { id: 'tianHu', nameZh: '天胡', nameEn: 'Heavenly Hand', fan: 8, multiplier: 256, description: '庄家起手和牌', excludes: [] },
  { id: 'diHu', nameZh: '地胡', nameEn: 'Earthly Hand', fan: 8, multiplier: 256, description: '闲家第一张牌自摸和牌', excludes: [] },
];

// 加番要素 (Multipliers)
export interface SichuanMultiplier {
  id: string;
  nameZh: string;
  nameEn: string;
  fanAdd: number; // 每个增加的番数
  description: string;
}

export const SICHUAN_MULTIPLIERS: SichuanMultiplier[] = [
  { id: 'gen', nameZh: '根', nameEn: 'Root', fanAdd: 1, description: '四张相同的牌（无论是否开杠），每根+1番' },
  { id: 'gangShangKaiHua', nameZh: '杠上开花', nameEn: 'Kong Bloom', fanAdd: 1, description: '杠后补牌和牌+1番' },
  { id: 'gangShangPao', nameZh: '杠上炮', nameEn: 'Kong Shot', fanAdd: 1, description: '杠后打牌点炮+1番' },
  { id: 'qiangGang', nameZh: '抢杠', nameEn: 'Rob Kong', fanAdd: 1, description: '抢杠和牌+1番' },
  { id: 'haiDiLao', nameZh: '海底捞', nameEn: 'Sea Bottom', fanAdd: 1, description: '最后一张牌和牌+1番' },
  { id: 'menQing', nameZh: '门清', nameEn: 'Concealed', fanAdd: 1, description: '门前清（无副露）+1番（部分规则）' },
  { id: 'zhongZhang', nameZh: '中张', nameEn: 'Middle Tiles', fanAdd: 1, description: '全部由2-8组成（断幺九）+1番（部分规则）' },
];

// 杠牌即时收益
export interface SichuanKongPayment {
  type: string;
  nameZh: string;
  nameEn: string;
  payment: string;
  description: string;
}

export const SICHUAN_KONG_PAYMENTS: SichuanKongPayment[] = [
  { type: 'anGang', nameZh: '暗杠', nameEn: 'Concealed Kong', payment: '每家付2倍底分', description: '4张全为自己摸到，下雨（收益更高）' },
  { type: 'mingGang', nameZh: '明杠(点杠)', nameEn: 'Direct Kong', payment: '点杠者付2倍底分', description: '3张手牌+别人打出的牌' },
  { type: 'jiaGang', nameZh: '加杠(补杠)', nameEn: 'Added Kong', payment: '每家付1倍底分', description: '碰后自摸第4张，刮风' },
];

// 特殊规则
export const SICHUAN_RULES = {
  VOID_SUIT_REQUIRED: true, // 必须定缺
  BLOOD_BATTLE: true, // 血战到底（一家胡牌后继续）
  HUA_ZHU_PENALTY: true, // 花猪赔付
  CHA_DA_JIAO_PENALTY: true, // 查大叫赔付
  BASE_MULTIPLIER: 1, // 底分倍数
  MAX_FAN_LIMIT: 10, // 封顶番数（部分规则）
};

// 四川麻将花色（无字牌）
export const SICHUAN_SUITS = [Suit.Man, Suit.Pin, Suit.Sou];

// 定缺花色选择
export const VOID_SUIT_OPTIONS = {
  [Suit.Man]: { zh: '缺万', en: 'Void Wan' },
  [Suit.Pin]: { zh: '缺筒', en: 'Void Pin' },
  [Suit.Sou]: { zh: '缺条', en: 'Void Sou' },
};

// 惩罚类型
export interface SichuanPenalty {
  id: string;
  nameZh: string;
  nameEn: string;
  condition: string;
  penalty: string;
}

export const SICHUAN_PENALTIES: SichuanPenalty[] = [
  { id: 'huaZhu', nameZh: '花猪', nameEn: 'Flower Pig', condition: '未打完定缺花色却已无牌可和', penalty: '赔付所有玩家（按最大番计算）' },
  { id: 'chaDaJiao', nameZh: '查大叫', nameEn: 'Big Call Check', condition: '游戏结束时未听牌', penalty: '赔付所有已听牌玩家（按其可能最大番计算）' },
  { id: 'chaDaJiaoHuaZhu', nameZh: '查花猪', nameEn: 'Check Flower Pig', condition: '游戏结束时仍有定缺花色', penalty: '赔付所有玩家（按最大番计算）' },
];

// ============================================================
// 通用工具函数
// ============================================================

export const createTile = (suit: Suit, value: number): Tile => ({
  id: `${suit}${value}-${Math.random().toString(36).substr(2, 9)}`,
  suit,
  value,
});

export const getTileKey = (suit: Suit, value: number) => `${value}${suit}`;

// 获取番种信息（支持多语言）
export const getPatternName = (patternId: string, lang: Language): string => {
  const allPatterns = [
    ...MCR_88_FAN, ...MCR_64_FAN, ...MCR_48_FAN, ...MCR_32_FAN,
    ...MCR_24_FAN, ...MCR_16_FAN, ...MCR_12_FAN, ...MCR_8_FAN,
    ...MCR_6_FAN, ...MCR_4_FAN, ...MCR_2_FAN, ...MCR_1_FAN,
    ...SICHUAN_BASE_PATTERNS,
  ];
  const pattern = allPatterns.find(p => p.id === patternId);
  if (!pattern) return patternId;
  return lang === 'zh' ? pattern.nameZh : pattern.nameEn;
};

// 计算四川麻将倍数
export const calculateSichuanMultiplier = (baseFan: number, roots: number = 0, extraFan: number = 0): number => {
  const totalFan = baseFan + roots + extraFan;
  return Math.pow(2, totalFan);
};
