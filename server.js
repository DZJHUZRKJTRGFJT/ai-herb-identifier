/**
 * 灵草鉴 - AI中药鉴定后端服务器 v5.0
 * 
 * 启动方式: node server.js
 * 
 * 识别策略（按优先级）:
 * 1. 云端AI视觉API（如果配置了API密钥 - 支持 OpenAI/通义千问/百度/DeepSeek）
 * 2. 本地Ollama视觉模型（如果已安装）
 * 3. LM Studio本地视觉模型
 * 4. 图片颜色特征分析 + 知识库匹配（始终可用，使用sharp正确解码像素）
 * 
 * v5.0 改进:
 * - 使用sharp库正确解码JPEG/PNG图片像素数据（v4.0直接从压缩字节采样是错误的）
 * - 改进颜色匹配算法，去除硬编码规则，改用通用语义匹配
 * - 增加纹理分析（粗糙度/均匀度/纤维性等辅助判断）
 * - 优化置信度计算，使结果更合理
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 尝试加载sharp图像处理库（用于正确的像素级颜色分析）
let sharp;
try {
  sharp = require('sharp');
  console.log('[灵草鉴] sharp图像处理库已加载，将使用像素级颜色分析');
} catch (e) {
  console.log('[灵草鉴] sharp未安装，将使用基础颜色分析模式');
  console.log('[灵草鉴] 建议运行: npm install sharp  以获得更准确的识别');
}

const PORT = 3001;

// ===================== API 配置 =====================
// 支持多种云端AI视觉API，用户可在此配置API密钥
// 也可通过环境变量配置: set HERB_API_KEY=xxx
const API_CONFIGS = {
  // 方式1: OpenAI API (GPT-4o / GPT-4V)
  openai: {
    enabled: !!(process.env.OPENAI_API_KEY),
    apiKey: process.env.OPENAI_API_KEY || '',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
  },
  // 方式2: 通义千问 API (Qwen-VL)
  qwen: {
    enabled: !!(process.env.QWEN_API_KEY),
    apiKey: process.env.QWEN_API_KEY || '',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-vl-max',
  },
  // 方式3: DeepSeek API
  deepseek: {
    enabled: !!(process.env.DEEPSEEK_API_KEY),
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat-vision',
  },
  // 方式4: 自定义 OpenAI 兼容 API（可配置任意兼容端点）
  custom: {
    enabled: !!(process.env.CUSTOM_API_KEY),
    apiKey: process.env.CUSTOM_API_KEY || '',
    apiUrl: process.env.CUSTOM_API_URL || '',
    model: process.env.CUSTOM_MODEL || '',
  }
};

// 检测可用的API
function getAvailableCloudAPI() {
  for (const [name, config] of Object.entries(API_CONFIGS)) {
    if (config.enabled && config.apiKey) {
      return { name, ...config };
    }
  }
  return null;
}

// ===================== 中药材知识库 =====================
const herbKnowledgeBase = [
  { name: '人参', latinName: 'Panax ginseng C.A.Mey.', family: '五加科', category: '补虚药', nature: '温', flavor: '甘、微苦', meridian: '脾、肺、心、肾经', part: '根及根茎', origin: '吉林、辽宁、黑龙江', dosage: '3-9g',
    efficacy: '大补元气，复脉固脱，补脾益肺，生津养血，安神益智。用于体虚欲脱，肢冷脉微，脾虚食少，肺虚喘咳，津伤口渴，内热消渴，气血亏虚，久病虚羸，惊悸失眠，阳痿宫冷。',
    identification: '主根呈纺锤形或圆柱形，表面灰黄色，有疏浅断续的粗横纹及明显的纵皱。根茎（芦头）多拘挛而弯曲，具不定根（艼）和稀疏的凹窝状茎痕（芦碗）。质较硬，断面淡黄白色，显粉性，形成层环纹棕黄色。',
    contraindication: '不宜与藜芦、五灵脂同用。实证、热证而正气不虚者忌服。',
    similarHerbs: [{ name: '西洋参', confidence: '12.4' }, { name: '红参', confidence: '5.8' }, { name: '党参', confidence: '2.1' }],
    colorProfile: { dominant: ['yellow-brown', 'beige', 'white'], secondary: ['pale-yellow', 'gray-brown'] },
    shapeHint: 'spindle/cylindrical root with transverse streaks',
    keywords: ['人参', 'ginseng', '五加科', '芦头', '芦碗', '纺锤形', '须根', '灰黄色', '横纹'] },
  { name: '黄芪', latinName: 'Astragalus membranaceus', family: '豆科', category: '补虚药', nature: '温', flavor: '甘', meridian: '脾、肺经', part: '根', origin: '甘肃、内蒙古、山西', dosage: '9-30g',
    efficacy: '补气升阳，固表止汗，利水消肿，生津养血，行滞通痹，托毒排脓，敛疮生肌。用于气虚乏力，食少便溏，中气下陷，久泻脱肛。',
    identification: '呈圆柱形，表面淡棕黄色或淡棕褐色，有不整齐的纵皱纹或纵沟。质硬而韧，断面纤维性强，并显粉性，皮部黄白色，木部淡黄色，有菊花心。',
    contraindication: '表实邪盛、内有积滞、阴虚阳亢者不宜用。',
    similarHerbs: [{ name: '红芪', confidence: '15.2' }, { name: '苦参', confidence: '3.1' }],
    colorProfile: { dominant: ['light-brown', 'pale-yellow', 'cream'], secondary: ['white', 'yellow-white'] },
    shapeHint: 'long cylindrical root with fibrous cross-section',
    keywords: ['黄芪', 'astragalus', '豆科', '菊花心', '纤维性', '圆柱形', '补气', '淡棕'] },
  { name: '当归', latinName: 'Angelica sinensis (Oliv.) Diels', family: '伞形科', category: '补虚药', nature: '温', flavor: '甘、辛', meridian: '肝、心、脾经', part: '根', origin: '甘肃、云南、四川', dosage: '6-12g',
    efficacy: '补血活血，调经止痛，润肠通便。用于血虚萎黄，眩晕心悸，月经不调，经闭痛经，虚寒腹痛，风湿痹痛，跌扑损伤，痈疽疮疡，肠燥便秘。',
    identification: '略呈圆柱形，下部有支根3-5条或更多。表面黄棕色至棕褐色，具纵皱纹及横长皮孔样突起。质柔韧，断面黄白色或淡黄棕色，皮部厚，有裂隙及多数棕色点状分泌腔。',
    contraindication: '湿盛中满、大便泄泻者忌服。',
    similarHerbs: [{ name: '独活', confidence: '8.5' }, { name: '白芷', confidence: '4.2' }],
    colorProfile: { dominant: ['brown', 'dark-brown', 'tan'], secondary: ['yellow-white', 'amber'] },
    shapeHint: 'cylindrical root with multiple branching rootlets',
    keywords: ['当归', 'angelica', '伞形科', '补血', '调经', '支根', '分泌腔', '棕褐色'] },
  { name: '金银花', latinName: 'Lonicera japonica Thunb.', family: '忍冬科', category: '清热药', nature: '寒', flavor: '甘', meridian: '肺、心、胃经', part: '花蕾或带初开的花', origin: '山东、河南、河北', dosage: '6-15g',
    efficacy: '清热解毒，疏散风热。用于痈肿疔疮，喉痹，丹毒，热毒血痢，风热感冒，温病发热。',
    identification: '呈棒状，上粗下细，略弯曲。表面黄白色或绿白色，密被短柔毛。花萼绿色，先端5裂。气清香，味淡、微苦。',
    contraindication: '脾胃虚寒及气虚疮疡脓清者忌服。',
    similarHerbs: [{ name: '山银花', confidence: '18.3' }, { name: '菊花', confidence: '6.7' }],
    colorProfile: { dominant: ['white', 'yellow-white', 'pale-green'], secondary: ['green', 'golden'] },
    shapeHint: 'slender tubular flower buds, white/yellow color',
    keywords: ['金银花', 'lonicera', '忍冬科', '清热', '解毒', '花蕾', '黄白色', '绿白色', '棒状'] },
  { name: '枸杞子', latinName: 'Lycium barbarum L.', family: '茄科', category: '补虚药', nature: '平', flavor: '甘', meridian: '肝、肾经', part: '成熟果实', origin: '宁夏、甘肃、青海', dosage: '6-12g',
    efficacy: '滋补肝肾，益精明目。用于虚劳精亏，腰膝酸痛，眩晕耳鸣，阳萎遗精，内热消渴，血虚萎黄，目昏不明。',
    identification: '呈类纺锤形或椭圆形，表面红色或暗红色，顶端有小突起状的花柱痕。果皮柔韧，皱缩；果肉肉质，柔润。种子类肾形。气微，味甜。',
    contraindication: '外邪实热、脾虚有湿及泄泻者忌服。',
    similarHerbs: [{ name: '地骨皮', confidence: '5.1' }],
    colorProfile: { dominant: ['red', 'dark-red', 'orange-red'], secondary: ['crimson', 'maroon'] },
    shapeHint: 'small elongated oval/ellipsoid red berries',
    keywords: ['枸杞', 'lycium', '茄科', '滋补', '肝肾', '红色', '果实', '甜', '纺锤形'] },
  { name: '川芎', latinName: 'Ligusticum chuanxiong Hort.', family: '伞形科', category: '活血化瘀药', nature: '温', flavor: '辛', meridian: '肝、胆、心包经', part: '根茎', origin: '四川、贵州、云南', dosage: '3-10g',
    efficacy: '活血行气，祛风止痛。用于胸痹心痛，胸胁刺痛，跌扑肿痛，月经不调，经闭痛经，癥瘕腹痛，头痛，风湿痹痛。',
    identification: '为不规则结节状拳形团块。表面黄褐色，粗糙皱缩，有多数平行隆起的轮节。质坚实，断面黄白色或灰黄色，散有黄棕色的油室。',
    contraindication: '阴虚火旺、多汗及月经过多者慎用。',
    similarHerbs: [{ name: '藁本', confidence: '10.3' }, { name: '防风', confidence: '4.6' }],
    colorProfile: { dominant: ['yellow-brown', 'gray-yellow', 'brown'], secondary: ['white-yellow', 'amber'] },
    shapeHint: 'irregular fist-shaped nodular mass',
    keywords: ['川芎', 'ligusticum', '伞形科', '活血', '拳形', '结节', '油室', '黄褐色'] },
  { name: '茯苓', latinName: 'Poria cocos (Schw.) Wolf', family: '多孔菌科', category: '利水渗湿药', nature: '平', flavor: '甘、淡', meridian: '心、肺、脾、肾经', part: '菌核', origin: '安徽、云南、湖北', dosage: '10-15g',
    efficacy: '利水渗湿，健脾，宁心。用于水肿尿少，痰饮眩悸，脾虚食少，便溏泄泻，心神不安，惊悸失眠。',
    identification: '呈类球形、椭圆形或不规则块状。外皮薄而粗糙，棕褐色至黑褐色。体重，质坚实，断面颗粒性，外层淡棕色，内部白色。',
    contraindication: '阴虚而无湿热、虚寒精滑者慎服。',
    similarHerbs: [{ name: '猪苓', confidence: '14.7' }, { name: '薏苡仁', confidence: '6.2' }],
    colorProfile: { dominant: ['white', 'cream', 'off-white'], secondary: ['brown', 'dark-brown'] },
    shapeHint: 'spherical/irregular block, white inside, brown outside',
    keywords: ['茯苓', 'poria', '菌核', '利水', '渗湿', '白色', '颗粒性', '球形'] },
  { name: '丹参', latinName: 'Salvia miltiorrhiza Bge.', family: '唇形科', category: '活血化瘀药', nature: '微寒', flavor: '苦', meridian: '心、肝经', part: '根及根茎', origin: '四川、山东、河南', dosage: '10-15g',
    efficacy: '活血祛瘀，通经止痛，清心除烦，凉血消痈。用于胸痹心痛，脘腹胁痛，癥瘕积聚，热痹疼痛，心烦不眠，月经不调，痛经经闭，疮疡肿痛。',
    identification: '根数条，长圆柱形，略弯曲。表面棕红色或暗棕红色，粗糙，具纵皱纹。质硬而脆，断面疏松，皮部棕红色，木部灰黄色或紫褐色。',
    contraindication: '不宜与藜芦同用。孕妇慎用。',
    similarHerbs: [{ name: '赤芍', confidence: '11.8' }, { name: '川芎', confidence: '5.3' }],
    colorProfile: { dominant: ['red-brown', 'dark-red', 'purple-brown'], secondary: ['gray-yellow', 'brick-red'] },
    shapeHint: 'long cylindrical roots, red-brown surface',
    keywords: ['丹参', 'salvia', '唇形科', '活血', '棕红色', '紫褐色', '圆柱形'] },
  { name: '麻黄', latinName: 'Ephedra sinica Stapf', family: '麻黄科', category: '解表药', nature: '温', flavor: '辛、微苦', meridian: '肺、膀胱经', part: '草质茎', origin: '内蒙古、山西、河北', dosage: '2-10g',
    efficacy: '发汗散寒，宣肺平喘，利水消肿。用于风寒感冒，胸闷喘咳，风水浮肿。',
    identification: '呈细长圆柱形，少分枝。表面淡绿色至黄绿色，有细纵脊线。节明显，节上有膜质鳞叶，裂片2，先端灰白色，锐三角形。',
    contraindication: '体虚自汗、阴虚盗汗及喘咳由于肾不纳气者忌服。高血压患者慎用。',
    similarHerbs: [{ name: '木贼', confidence: '9.6' }],
    colorProfile: { dominant: ['green', 'yellow-green', 'pale-green'], secondary: ['white-gray', 'tan'] },
    shapeHint: 'slender cylindrical green stems with nodes',
    keywords: ['麻黄', 'ephedra', '麻黄科', '解表', '发汗', '绿色', '草质茎', '节'] },
  { name: '黄连', latinName: 'Coptis chinensis Franch.', family: '毛茛科', category: '清热药', nature: '寒', flavor: '苦', meridian: '心、脾、胃、肝、胆、大肠经', part: '根茎', origin: '四川、湖北、云南', dosage: '2-5g',
    efficacy: '清热燥湿，泻火解毒。用于湿热痞满，呕吐吞酸，泻痢，黄疸，高热神昏，心火亢盛，心烦不寐，血热吐衄，目赤，牙痛，消渴，痈肿疔疮。',
    identification: '多集聚成簇，形如鸡爪。表面灰黄色或黄褐色，粗糙。质硬，断面不整齐，皮部橙红色或暗棕色，木部鲜黄色或橙黄色，呈放射状排列。',
    contraindication: '脾胃虚寒者忌用；阴虚津伤者慎用。',
    similarHerbs: [{ name: '胡黄连', confidence: '16.4' }, { name: '黄柏', confidence: '8.2' }],
    colorProfile: { dominant: ['yellow', 'orange-yellow', 'golden'], secondary: ['gray-yellow', 'orange-red'] },
    shapeHint: 'cluster of curved rhizomes resembling chicken claws',
    keywords: ['黄连', 'coptis', '毛茛科', '清热', '燥湿', '鸡爪', '黄色', '橙红色'] },
  { name: '半夏', latinName: 'Pinellia ternata (Thunb.) Breit.', family: '天南星科', category: '化痰止咳药', nature: '温', flavor: '辛', meridian: '脾、胃、肺经', part: '块茎', origin: '四川、湖北、河南', dosage: '3-9g',
    efficacy: '燥湿化痰，降逆止呕，消痞散结。用于湿痰寒痰，咳喘痰多，痰饮眩悸，风痰眩晕，痰厥头痛，呕吐反胃，胸脘痞闷，梅核气。',
    identification: '呈类球形，有的稍偏斜。表面白色或浅黄色，顶端有凹陷的茎痕，周围密布麻点状根痕。质坚实，断面洁白，富粉性。',
    contraindication: '不宜与川乌、草乌、附子同用。生品内服宜慎。',
    similarHerbs: [{ name: '天南星', confidence: '13.5' }, { name: '白附子', confidence: '7.1' }],
    colorProfile: { dominant: ['white', 'cream-white', 'pale-yellow'], secondary: ['off-white', 'ivory'] },
    shapeHint: 'spherical tuber with dotted root scars',
    keywords: ['半夏', 'pinellia', '天南星科', '化痰', '球形', '白色', '粉性', '麻点'] },
  { name: '酸枣仁', latinName: 'Ziziphus jujuba Mill. var. spinosa', family: '鼠李科', category: '安神药', nature: '平', flavor: '甘、酸', meridian: '肝、胆、心经', part: '成熟种子', origin: '河北、陕西、辽宁', dosage: '10-15g',
    efficacy: '养心补肝，宁心安神，敛汗，生津。用于虚烦不眠，惊悸多梦，体虚多汗，津伤口渴。',
    identification: '呈扁圆形或扁椭圆形。表面紫红色或紫褐色，平滑有光泽。一面较平坦，中间有1条隆起的纵线纹。种皮较脆，胚乳白色，子叶2，浅黄色，富油性。',
    contraindication: '内有实邪郁火者慎服。',
    similarHerbs: [{ name: '柏子仁', confidence: '12.3' }, { name: '远志', confidence: '5.8' }],
    colorProfile: { dominant: ['purple-red', 'purple-brown', 'mahogany'], secondary: ['brown', 'dark-red'] },
    shapeHint: 'flat round/elliptical seeds with purple-red surface',
    keywords: ['酸枣仁', 'ziziphus', '鼠李科', '安神', '紫红色', '种子', '扁圆'] },
  { name: '甘草', latinName: 'Glycyrrhiza uralensis Fisch.', family: '豆科', category: '补虚药', nature: '平', flavor: '甘', meridian: '心、肺、脾、胃经', part: '根及根茎', origin: '内蒙古、甘肃、新疆', dosage: '2-10g',
    efficacy: '补脾益气，清热解毒，祛痰止咳，缓急止痛，调和诸药。用于脾胃虚弱，倦怠乏力，心悸气短，咳嗽痰多，脘腹、四肢挛急疼痛，痈肿疮毒，缓解药物毒性、烈性。',
    identification: '呈圆柱形。表面红棕色或灰棕色，有显著的纵皱纹、沟纹及稀疏的细根痕。质坚实，断面略显纤维性，黄白色，粉性，形成层环明显，射线放射状。',
    contraindication: '不宜与海藻、京大戟、红大戟、甘遂、芫花同用。湿盛胀满、水肿者不宜用。',
    similarHerbs: [{ name: '胀果甘草', confidence: '8.9' }],
    colorProfile: { dominant: ['red-brown', 'gray-brown', 'cinnamon'], secondary: ['yellow-white', 'fibrous'] },
    shapeHint: 'long cylindrical root with fibrous cross-section',
    keywords: ['甘草', 'glycyrrhiza', '豆科', '调和诸药', '红棕色', '圆柱形', '纤维性'] },
  { name: '白术', latinName: 'Atractylodes macrocephala Koidz.', family: '菊科', category: '补虚药', nature: '温', flavor: '甘、苦', meridian: '脾、胃经', part: '根茎', origin: '浙江、安徽、湖南', dosage: '6-12g',
    efficacy: '健脾益气，燥湿利水，止汗，安胎。用于脾虚食少，腹胀泄泻，痰饮眩悸，水肿，自汗，胎动不安。',
    identification: '呈不规则肥厚团块。表面灰黄色或灰棕色，有瘤状突起及断续的纵皱和沟纹。质坚硬，不易折断，断面不平坦，黄白色至淡棕色，有棕黄色的点状油室。',
    contraindication: '阴虚燥渴、气滞胀闷者忌服。',
    similarHerbs: [{ name: '苍术', confidence: '22.1' }, { name: '白芍', confidence: '3.4' }],
    colorProfile: { dominant: ['gray-yellow', 'gray-brown', 'cream'], secondary: ['white-yellow', 'tan'] },
    shapeHint: 'irregular thick mass with warty protrusions',
    keywords: ['白术', 'atractylodes', '菊科', '健脾', '肥厚', '团块', '灰黄色', '油室'] },
  { name: '菊花', latinName: 'Chrysanthemum morifolium Ramat.', family: '菊科', category: '解表药', nature: '微寒', flavor: '甘、苦', meridian: '肺、肝经', part: '头状花序', origin: '安徽、浙江、河南', dosage: '5-10g',
    efficacy: '疏散风热，平肝明目，清热解毒。用于风热感冒，头痛眩晕，目赤肿痛，眼目昏花，疮痈肿毒。',
    identification: '呈扁球形或不规则球形。总苞由3-4层苞片组成，外围为数层舌状花，中央为管状花。体轻，质柔润。气清香，味甘、微苦。',
    contraindication: '气虚胃寒、食少泄泻者慎服。',
    similarHerbs: [{ name: '野菊花', confidence: '19.8' }, { name: '金银花', confidence: '7.3' }],
    colorProfile: { dominant: ['white', 'yellow', 'pale-yellow'], secondary: ['green', 'golden'] },
    shapeHint: 'flat spherical flower head with radiating petals',
    keywords: ['菊花', 'chrysanthemum', '菊科', '疏散风热', '花序', '舌状花', '管状花', '清香'] },
  { name: '三七', latinName: 'Panax notoginseng (Burk.) F.H.Chen', family: '五加科', category: '止血药', nature: '温', flavor: '甘、微苦', meridian: '肝、胃经', part: '根及根茎', origin: '云南、广西', dosage: '3-9g',
    efficacy: '散瘀止血，消肿定痛。用于咯血，吐血，衄血，便血，崩漏，外伤出血，胸腹刺痛，跌扑肿痛。',
    identification: '主根呈类圆锥形或圆柱形。表面灰褐色或灰黄色，有断续的纵皱纹及支根痕。顶端有茎痕，周围有瘤状突起。体重，质坚实，断面灰绿色、灰棕色或灰黑色，木部微呈放射状排列。',
    contraindication: '孕妇慎用。',
    similarHerbs: [{ name: '人参', confidence: '14.2' }, { name: '景天三七', confidence: '6.8' }],
    colorProfile: { dominant: ['gray-brown', 'gray-green', 'dark-gray'], secondary: ['brown', 'green-gray'] },
    shapeHint: 'conical root with warty protrusions at top',
    keywords: ['三七', 'notoginseng', '五加科', '止血', '散瘀', '圆锥形', '灰绿色', '瘤状'] }
];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ===================== AI 视觉API调用 =====================

const SYSTEM_PROMPT = `你是一个专业的中药材AI鉴定专家。你需要根据用户提供的药材图片，进行专业的鉴定分析。

你必须以严格的JSON格式返回结果，包含以下字段：
{
  "name": "药材中文名称",
  "latinName": "拉丁学名",
  "family": "科属",
  "category": "药物分类（如补虚药、清热药等）",
  "nature": "药性（寒/凉/平/温/热）",
  "flavor": "药味（如甘、苦、辛等）",
  "meridian": "归经",
  "part": "药用部位",
  "origin": "主要产地",
  "dosage": "常规用量",
  "confidence": "识别置信度（0-100的数字）",
  "efficacy": "功效主治详细描述",
  "identification": "性状鉴别要点",
  "contraindication": "使用注意事项和禁忌",
  "similarHerbs": [{"name": "相似品种名", "confidence": "相似度百分比数字"}],
  "aiAnalysis": "AI对图片的视觉分析描述，包括观察到的颜色、形状、纹理、大小等特征"
}

如果图片不是中药材或无法识别，请返回：
{"name": "无法识别", "confidence": "0", "aiAnalysis": "描述图片内容并说明无法识别的原因"}

只返回JSON，不要有任何其他文字。`;

/**
 * 调用 OpenAI 兼容视觉API
 */
async function callVisionAPI(apiUrl, model, apiKey, imageBase64) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2分钟超时

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请仔细观察这张图片，鉴定其中是否包含中药材。如果是中药材，请以JSON格式返回鉴定结果。如果图片中不是中药材，也请如实说明。' },
              { type: 'image_url', image_url: { url: imageBase64 } }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    clearTimeout(timeout);
    if (!response.ok) {
      console.log('[灵草鉴] API返回错误:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || data.message?.content;
    if (!content) return null;

    // 尝试提取JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.confidence === 'number') parsed.confidence = parsed.confidence.toFixed(1);
        return parsed;
      } catch (e) { return null; }
    }
    return null;
  } catch (e) {
    clearTimeout(timeout);
    console.log('[灵草鉴] API调用失败:', e.message);
    return null;
  }
}

// ===================== 图片颜色特征分析 =====================

/**
 * 将RGB颜色分类到语义颜色类别
 */
function classifyPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const avg = (r + g + b) / 3;
  const saturation = max === 0 ? 0 : delta / max;

  // 低饱和度 → 灰色系
  if (saturation < 0.12) {
    if (avg > 210) return 'white';
    if (avg > 160) return 'light-gray';
    if (avg > 90) return 'gray';
    if (avg > 40) return 'dark-gray';
    return 'black';
  }

  // 计算色相 (Hue)
  let h;
  if (delta === 0) h = 0;
  else if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  if (h < 0) h += 360;

  // 亮度
  const lightness = (max + min) / 2 / 255;

  // 基于色相和亮度分类
  if (h < 15 || h >= 345) {
    // 红色区域
    if (lightness < 0.25) return 'dark-red';
    if (saturation < 0.4) return 'brown';
    if (lightness > 0.6) return 'orange-red';
    return 'red';
  }
  if (h < 40) {
    // 橙色区域
    if (lightness > 0.65) return 'yellow-orange';
    if (lightness < 0.3) return 'brown';
    return 'orange';
  }
  if (h < 70) {
    // 黄色区域
    if (lightness > 0.75) return 'pale-yellow';
    if (lightness < 0.3) return 'dark-yellow-brown';
    return 'yellow';
  }
  if (h < 155) {
    // 绿色区域
    if (lightness > 0.7) return 'pale-green';
    if (lightness < 0.25) return 'dark-green';
    if (saturation < 0.25) return 'yellow-green';
    return 'green';
  }
  if (h < 200) {
    // 青色区域
    return 'cyan';
  }
  if (h < 260) {
    // 蓝色区域
    if (lightness > 0.6) return 'light-blue';
    return 'blue';
  }
  if (h < 310) {
    // 紫色区域
    if (lightness < 0.25) return 'dark-purple';
    if (lightness > 0.55) return 'lavender';
    return 'purple';
  }
  // 粉红区域 (310-345)
  if (lightness > 0.6) return 'pink';
  return 'magenta';
}

/**
 * 语义颜色映射：将细粒度颜色映射到知识库中的颜色名称
 */
const COLOR_SEMANTICS = {
  'red': ['red', 'dark-red', 'crimson', 'maroon', 'orange-red', 'magenta'],
  'brown': ['brown', 'dark-red', 'dark-yellow-brown', 'yellow-orange', 'orange'],
  'yellow': ['yellow', 'pale-yellow', 'yellow-orange', 'dark-yellow-brown'],
  'green': ['green', 'dark-green', 'pale-green', 'yellow-green', 'cyan'],
  'white': ['white', 'light-gray', 'pale-yellow', 'pale-green', 'lavender'],
  'gray': ['gray', 'dark-gray', 'light-gray'],
  'black': ['black', 'dark-gray', 'dark-green', 'dark-purple'],
  'orange': ['orange', 'yellow-orange', 'orange-red', 'brown'],
  'purple': ['purple', 'dark-purple', 'lavender', 'magenta', 'pink'],
  'blue': ['blue', 'light-blue', 'cyan'],
};

/**
 * 语义颜色到中文的映射
 */
const COLOR_NAMES_CN = {
  red: '红色', 'dark-red': '暗红色', 'orange-red': '橙红色', magenta: '品红色',
  brown: '棕色', orange: '橙色', 'yellow-orange': '黄橙色',
  yellow: '黄色', 'pale-yellow': '淡黄色', 'dark-yellow-brown': '暗黄棕色',
  green: '绿色', 'dark-green': '暗绿色', 'pale-green': '浅绿色', 'yellow-green': '黄绿色', cyan: '青色',
  white: '白色', 'light-gray': '浅灰色', gray: '灰色', 'dark-gray': '深灰色', black: '黑色',
  purple: '紫色', 'dark-purple': '暗紫色', lavender: '淡紫色', pink: '粉红色',
};

/**
 * 使用sharp正确解码图片并提取颜色特征
 * 自动去除背景色以提高识别准确度
 */
async function analyzeImageColorsSharp(base64Data) {
  const buffer = Buffer.from(base64Data, 'base64');
  
  // 使用sharp解码图片为原始像素数据
  // 缩小到200x200以加速处理，同时保留颜色特征
  const { data, info } = await sharp(buffer)
    .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const width = info.width;
  const height = info.height;
  const channels = info.channels; // 3=RGB, 4=RGBA
  
  // 第一步：收集所有像素颜色
  const allColors = [];
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    allColors.push({ r, g, b, category: classifyPixel(r, g, b) });
  }
  
  // 第二步：自动检测背景色
  // 假设：图片边缘（最外圈5像素）的颜色很可能是背景色
  const edgePixels = [];
  const edgeWidth = 5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < edgeWidth || x >= width - edgeWidth || y < edgeWidth || y >= height - edgeWidth) {
        const idx = (y * width + x) * channels;
        edgePixels.push({
          r: data[idx], g: data[idx + 1], b: data[idx + 2],
          category: classifyPixel(data[idx], data[idx + 1], data[idx + 2])
        });
      }
    }
  }
  
  // 统计边缘颜色分布，找出最可能的背景色
  const edgeColorCounts = {};
  edgePixels.forEach(p => {
    edgeColorCounts[p.category] = (edgeColorCounts[p.category] || 0) + 1;
  });
  const edgeTotal = edgePixels.length || 1;
  const bgCategories = Object.entries(edgeColorCounts)
    .filter(([_, count]) => count / edgeTotal > 0.3)
    .map(([cat]) => cat);
  
  // 如果背景色是白色/浅灰/浅色系，标记需要去除
  const bgIsLight = bgCategories.some(c => ['white', 'light-gray', 'pale-yellow', 'pale-green', 'cream'].includes(c));
  const bgIsDark = bgCategories.some(c => ['black', 'dark-gray'].includes(c));
  
  // 第三步：过滤掉背景色像素，只分析药材本身的颜色
  const herbPixels = allColors.filter(p => {
    if (bgIsLight) {
      // 去除浅色背景：跳过饱和度极低且亮度高的像素
      const max = Math.max(p.r, p.g, p.b);
      const min = Math.min(p.r, p.g, p.b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const avg = (p.r + p.g + p.b) / 3;
      if (sat < 0.08 && avg > 200) return false; // 几乎纯白
      if (sat < 0.05 && avg > 180) return false; // 非常浅的灰
    }
    if (bgIsDark) {
      const max = Math.max(p.r, p.g, p.b);
      const min = Math.min(p.r, p.g, p.b);
      const avg = (p.r + p.g + p.b) / 3;
      if (avg < 30 && (max - min) < 15) return false; // 几乎纯黑
    }
    // 排除已知背景类别
    if (bgCategories.includes(p.category) && (bgIsLight || bgIsDark)) return false;
    return true;
  });
  
  // 如果过滤后像素太少（极端情况），回退到全部像素
  const analysisPixels = herbPixels.length > allColors.length * 0.15 ? herbPixels : allColors;
  const totalPixels = analysisPixels.length;
  
  const colorCounts = {};
  analysisPixels.forEach(p => {
    colorCounts[p.category] = (colorCounts[p.category] || 0) + 1;
  });
  
  // 归一化并排序
  const colorProfile = Object.entries(colorCounts)
    .map(([color, count]) => ({ color, ratio: count / totalPixels }))
    .filter(c => c.ratio > 0.01)
    .sort((a, b) => b.ratio - a.ratio);
  
  // 计算颜色统计特征
  const getColorRatio = (name) => {
    const semanticColors = COLOR_SEMANTICS[name] || [name];
    return semanticColors.reduce((sum, sc) => sum + (colorCounts[sc] || 0), 0) / totalPixels;
  };
  
  // 纹理分析：计算颜色分布的分散度（越高越杂色/粗糙）
  const topColorEntropy = colorProfile.slice(0, 8).reduce((sum, c) => {
    return sum - (c.ratio > 0 ? c.ratio * Math.log2(c.ratio) : 0);
  }, 0);
  
  // 分析空间分布：将图片分为4象限，比较颜色一致性
  const quadrantColors = [[], [], [], []];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const category = classifyPixel(data[idx], data[idx + 1], data[idx + 2]);
      const qIdx = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
      quadrantColors[qIdx].push(category);
    }
  }
  
  const quadrantDominants = quadrantColors.map(colors => {
    const counts = {};
    colors.forEach(c => counts[c] = (counts[c] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  });
  const uniformQuadrants = new Set(quadrantDominants).size;
  
  // 计算背景比例
  const bgRatio = bgIsLight || bgIsDark 
    ? edgePixels.filter(p => bgCategories.includes(p.category)).length / edgeTotal 
    : 0;
  
  return {
    fileSize: buffer.length,
    format: info.format || 'unknown',
    width,
    height,
    dominantColors: colorProfile.slice(0, 8),
    // 语义颜色比例
    redRatio: getColorRatio('red'),
    brownRatio: getColorRatio('brown'),
    yellowRatio: getColorRatio('yellow'),
    greenRatio: getColorRatio('green'),
    whiteRatio: getColorRatio('white'),
    grayRatio: getColorRatio('gray'),
    blackRatio: getColorRatio('black'),
    orangeRatio: getColorRatio('orange'),
    purpleRatio: getColorRatio('purple'),
    blueRatio: getColorRatio('blue'),
    // 布尔标记
    isMostlyRed: getColorRatio('red') > 0.2,
    isMostlyGreen: getColorRatio('green') > 0.25,
    isMostlyWhite: getColorRatio('white') > 0.35,
    isMostlyBrown: getColorRatio('brown') > 0.25,
    isMostlyYellow: getColorRatio('yellow') > 0.2,
    isMostlyOrange: getColorRatio('orange') > 0.15,
    isMostlyPurple: getColorRatio('purple') > 0.1,
    isMostlyGray: getColorRatio('gray') > 0.2,
    // 特征标记
    hasRed: getColorRatio('red') > 0.05,
    hasGreen: getColorRatio('green') > 0.05,
    hasBrown: getColorRatio('brown') > 0.05,
    hasWhite: getColorRatio('white') > 0.05,
    hasYellow: getColorRatio('yellow') > 0.05,
    hasPurple: getColorRatio('purple') > 0.03,
    hasOrange: getColorRatio('orange') > 0.03,
    // 纹理特征
    colorEntropy: topColorEntropy,
    isUniform: uniformQuadrants <= 2,
    isDiverse: uniformQuadrants >= 3,
    colorDiversity: colorProfile.filter(c => c.ratio > 0.05).length,
    // 背景信息
    backgroundDetected: bgIsLight || bgIsDark,
    backgroundRatio: bgRatio,
    backgroundColors: bgCategories,
  };
}

/**
 * 基础颜色分析（不依赖sharp，准确度较低）
 * 从base64数据中尝试提取基本颜色信息
 */
function analyzeImageColorsBasic(base64Data) {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const fileSize = buffer.length;
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;

    // 对于JPEG，跳过头部标记段，找到图像数据起始位置
    // JPEG的SOS(Start of Scan)标记后是压缩的图像数据
    let dataStart = 0;
    if (isJPEG) {
      for (let i = 2; i < Math.min(buffer.length, 100000); i++) {
        if (buffer[i] === 0xFF && buffer[i + 1] === 0xDA) {
          // 找到SOS标记，跳过标记头
          const segLen = (buffer[i + 2] << 8) | buffer[i + 3];
          dataStart = i + 2 + segLen;
          break;
        }
      }
    }

    if (dataStart === 0) {
      // 无法定位图像数据，使用全文件采样（效果差但不会崩溃）
      dataStart = isJPEG ? 500 : (isPNG ? 100 : 0);
    }

    // 从压缩数据段采样（虽然不是真正的像素值，但比从文件头采样好得多）
    const sampleCount = 3000;
    const sampleStep = Math.max(1, Math.floor((buffer.length - dataStart) / sampleCount));
    const colorCounts = {};
    let totalSamples = 0;

    for (let i = dataStart; i < buffer.length - 2; i += sampleStep) {
      const r = buffer[i];
      const g = buffer[i + 1];
      const b = buffer[i + 2];
      
      // 跳过JPEG重启标记
      if (r === 0xFF && (g >= 0xD0 && g <= 0xD7)) continue;
      
      const category = classifyPixel(r, g, b);
      colorCounts[category] = (colorCounts[category] || 0) + 1;
      totalSamples++;
    }

    const colorProfile = Object.entries(colorCounts)
      .map(([color, count]) => ({ color, ratio: count / (totalSamples || 1) }))
      .filter(c => c.ratio > 0.01)
      .sort((a, b) => b.ratio - a.ratio);

    const getColorRatio = (name) => {
      const semanticColors = COLOR_SEMANTICS[name] || [name];
      return semanticColors.reduce((sum, sc) => sum + (colorCounts[sc] || 0), 0) / (totalSamples || 1);
    };

    return {
      fileSize,
      format: isJPEG ? 'JPEG' : isPNG ? 'PNG' : 'unknown',
      dominantColors: colorProfile.slice(0, 8),
      redRatio: getColorRatio('red'),
      brownRatio: getColorRatio('brown'),
      yellowRatio: getColorRatio('yellow'),
      greenRatio: getColorRatio('green'),
      whiteRatio: getColorRatio('white'),
      grayRatio: getColorRatio('gray'),
      blackRatio: getColorRatio('black'),
      orangeRatio: getColorRatio('orange'),
      purpleRatio: getColorRatio('purple'),
      blueRatio: getColorRatio('blue'),
      isMostlyRed: getColorRatio('red') > 0.2,
      isMostlyGreen: getColorRatio('green') > 0.25,
      isMostlyWhite: getColorRatio('white') > 0.35,
      isMostlyBrown: getColorRatio('brown') > 0.25,
      isMostlyYellow: getColorRatio('yellow') > 0.2,
      isMostlyOrange: getColorRatio('orange') > 0.15,
      isMostlyPurple: getColorRatio('purple') > 0.1,
      isMostlyGray: getColorRatio('gray') > 0.2,
      hasRed: getColorRatio('red') > 0.05,
      hasGreen: getColorRatio('green') > 0.05,
      hasBrown: getColorRatio('brown') > 0.05,
      hasWhite: getColorRatio('white') > 0.05,
      hasYellow: getColorRatio('yellow') > 0.05,
      hasPurple: getColorRatio('purple') > 0.03,
      hasOrange: getColorRatio('orange') > 0.03,
      colorEntropy: 0,
      isUniform: true,
      isDiverse: false,
      colorDiversity: colorProfile.filter(c => c.ratio > 0.05).length,
      _isBasicMode: true,
    };
  } catch (e) {
    console.log('[灵草鉴] 基础颜色分析失败:', e.message);
    return null;
  }
}

/**
 * 分析图片的颜色分布特征（统一入口）
 */
async function analyzeImageColors(base64Data) {
  if (sharp) {
    try {
      return await analyzeImageColorsSharp(base64Data);
    } catch (e) {
      console.log('[灵草鉴] sharp分析失败，回退到基础模式:', e.message);
      return analyzeImageColorsBasic(base64Data);
    }
  }
  return analyzeImageColorsBasic(base64Data);
}

/**
 * 颜色名称语义映射表
 * 知识库中的颜色描述 → 可与颜色分析结果匹配的语义标签
 */
const COLOR_SYNONYMS = {
  // 红色系
  'red': ['red'], 'dark-red': ['red'], 'crimson': ['red'], 'maroon': ['red', 'brown'],
  'orange-red': ['red', 'orange'], 'brick-red': ['red', 'brown'],
  // 棕色系
  'brown': ['brown'], 'dark-brown': ['brown'], 'yellow-brown': ['brown', 'yellow'],
  'gray-brown': ['brown', 'gray'], 'red-brown': ['brown', 'red'], 'cinnamon': ['brown'],
  'tan': ['brown', 'yellow'], 'amber': ['brown', 'yellow', 'orange'],
  // 黄色系
  'yellow': ['yellow'], 'golden': ['yellow'], 'pale-yellow': ['yellow', 'white'],
  'orange-yellow': ['yellow', 'orange'], 'yellow-white': ['yellow', 'white'],
  'dark-yellow-brown': ['yellow', 'brown'],
  // 绿色系
  'green': ['green'], 'dark-green': ['green'], 'pale-green': ['green', 'white'],
  'yellow-green': ['green', 'yellow'], 'gray-green': ['green', 'gray'],
  'green-gray': ['green', 'gray'],
  // 白色系
  'white': ['white'], 'cream': ['white', 'yellow'], 'off-white': ['white'],
  'ivory': ['white'], 'cream-white': ['white'], 'beige': ['white', 'brown'],
  'white-yellow': ['white', 'yellow'],
  // 灰色系
  'gray': ['gray'], 'light-gray': ['gray', 'white'], 'dark-gray': ['gray'],
  'gray-yellow': ['gray', 'yellow'],
  // 紫色系
  'purple': ['purple'], 'purple-red': ['purple', 'red'], 'purple-brown': ['purple', 'brown'],
  'mahogany': ['purple', 'brown', 'red'], 'dark-purple': ['purple'],
  // 橙色系
  'orange': ['orange'],
  // 蓝色系
  'blue': ['blue'],
  // 黑色系
  'black': ['black'], 'dark-gray': ['gray', 'black'],
  // 特殊描述
  'fibrous': [], // 纹理描述，不含颜色
};

/**
 * 基于颜色特征匹配知识库中的药材
 * 通用语义匹配，无硬编码规则
 */
function matchByColorProfile(colorAnalysis) {
  if (!colorAnalysis) return [];
  
  const scores = herbKnowledgeBase.map(herb => {
    let score = 0;
    const profile = herb.colorProfile;
    
    // 获取图片中各语义颜色的比例
    const imageColors = {
      red: colorAnalysis.redRatio || 0,
      brown: colorAnalysis.brownRatio || 0,
      yellow: colorAnalysis.yellowRatio || 0,
      green: colorAnalysis.greenRatio || 0,
      white: colorAnalysis.whiteRatio || 0,
      gray: colorAnalysis.grayRatio || 0,
      black: colorAnalysis.blackRatio || 0,
      orange: colorAnalysis.orangeRatio || 0,
      purple: colorAnalysis.purpleRatio || 0,
      blue: colorAnalysis.blueRatio || 0,
    };
    
    // === 主色调匹配 ===
    // 将知识库中的dominant颜色描述映射到语义标签
    const dominantSemanticTags = new Set();
    (profile.dominant || []).forEach(colorName => {
      const synonyms = COLOR_SYNONYMS[colorName];
      if (synonyms) synonyms.forEach(tag => dominantSemanticTags.add(tag));
    });
    
    // 对每个主色调标签，如果图片中该颜色比例高，则加分
    for (const tag of dominantSemanticTags) {
      const ratio = imageColors[tag] || 0;
      if (ratio > 0.2) score += 30;      // 主要颜色
      else if (ratio > 0.1) score += 20;  // 显著颜色
      else if (ratio > 0.05) score += 10; // 可见颜色
      else score -= 5;                     // 缺少预期颜色，扣分
    }
    
    // === 辅助色调匹配 ===
    const secondarySemanticTags = new Set();
    (profile.secondary || []).forEach(colorName => {
      const synonyms = COLOR_SYNONYMS[colorName];
      if (synonyms) synonyms.forEach(tag => secondarySemanticTags.add(tag));
    });
    
    // 排除主色调已有的标签
    for (const tag of secondarySemanticTags) {
      if (dominantSemanticTags.has(tag)) continue; // 避免重复计算
      const ratio = imageColors[tag] || 0;
      if (ratio > 0.15) score += 15;
      else if (ratio > 0.05) score += 8;
      else if (ratio > 0.02) score += 3;
    }
    
    // === 否定色惩罚 ===
    // 如果图片有大量某种颜色，但知识库完全没有提到这种颜色，轻微惩罚
    for (const [color, ratio] of Object.entries(imageColors)) {
      if (ratio > 0.2 && !dominantSemanticTags.has(color) && !secondarySemanticTags.has(color)) {
        score -= 8;
      }
    }
    
    // === 形状提示辅助 ===
    // 利用shapeHint信息进行微调
    const hint = herb.shapeHint || '';
    if (colorAnalysis.colorDiversity) {
      // 纹理丰富的药材（如黄连鸡爪形）通常颜色更多样
      if (hint.includes('cluster') || hint.includes('multiple') || hint.includes('irregular')) {
        if (colorAnalysis.colorDiversity >= 4) score += 5;
      }
      // 单一形态的药材（如圆柱形根）颜色较统一
      if (hint.includes('cylindrical') || hint.includes('spherical') || hint.includes('tuber')) {
        if (colorAnalysis.colorDiversity <= 3) score += 3;
      }
    }
    
    return { herb, score };
  });
  
  return scores.sort((a, b) => b.score - a.score);
}

// ===================== 主识别函数 =====================

async function identifyHerb(imageBase64) {
  const startTime = Date.now();
  let usedSource = 'none';
  
  // 策略1: 尝试云端AI视觉API
  const cloudAPI = getAvailableCloudAPI();
  if (cloudAPI) {
    console.log('[灵草鉴] 尝试云端AI:', cloudAPI.name);
    try {
      const result = await callVisionAPI(cloudAPI.apiUrl, cloudAPI.model, cloudAPI.apiKey, imageBase64);
      if (result && result.name && result.name !== '无法识别') {
        usedSource = 'cloud-' + cloudAPI.name;
        result._source = usedSource;
        result._duration = Date.now() - startTime;
        return result;
      }
      // 如果AI识别不出，继续尝试其他策略
      if (result && result.name === '无法识别') {
        usedSource = 'cloud-' + cloudAPI.name;
        result._source = usedSource;
        result._duration = Date.now() - startTime;
        return result; // AI明确说无法识别，直接返回
      }
    } catch (e) {
      console.log('[灵草鉴] 云端AI失败:', e.message);
    }
  }
  
  // 策略2: 尝试本地Ollama视觉模型
  const ollamaEndpoints = [
    { url: 'http://localhost:11434/v1/chat/completions', model: 'llava' },
    { url: 'http://localhost:11434/api/chat', model: 'llava' },
  ];
  
  for (const ep of ollamaEndpoints) {
    try {
      console.log('[灵草鉴] 尝试Ollama:', ep.url);
      const result = await callVisionAPI(ep.url, ep.model, null, imageBase64);
      if (result && result.name && result.name !== '无法识别') {
        usedSource = 'ollama';
        result._source = usedSource;
        result._duration = Date.now() - startTime;
        return result;
      }
    } catch (e) { /* try next */ }
  }
  
  // 策略3: 尝试LM Studio
  try {
    console.log('[灵草鉴] 尝试LM Studio');
    const result = await callVisionAPI('http://localhost:8080/v1/chat/completions', 'default', null, imageBase64);
    if (result && result.name && result.name !== '无法识别') {
      usedSource = 'lmstudio';
      result._source = usedSource;
      result._duration = Date.now() - startTime;
      return result;
    }
  } catch (e) { /* fallback */ }
  
  // 策略4: 图片颜色特征分析 + 知识库匹配
  console.log('[灵草鉴] 使用颜色特征分析+知识库匹配');
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const colorAnalysis = await analyzeImageColors(base64Data);
  const colorMatches = matchByColorProfile(colorAnalysis);
  
  // 取得分最高的药材
  const bestMatch = colorMatches[0];
  if (!bestMatch || !bestMatch.herb) {
    return {
      name: '无法识别',
      confidence: '0.0',
      aiAnalysis: '未能从图片中提取有效的颜色特征信息。',
      _source: 'color-analysis',
      _duration: Date.now() - startTime
    };
  }
  
  const herb = bestMatch.herb;
  const matchScore = bestMatch.score;
  
  // 计算与第二名的分数差距（差距越大，置信度越高）
  const secondScore = colorMatches[1] ? colorMatches[1].score : 0;
  const scoreGap = matchScore - secondScore;
  
  // 根据颜色匹配得分和差距计算置信度
  // 高分+大差距 → 高置信度；低分+小差距 → 低置信度
  let confidence;
  if (matchScore <= 0) {
    confidence = 15; // 基本不匹配
  } else if (scoreGap > 30 && matchScore > 50) {
    confidence = Math.min(72, Math.round(matchScore * 0.7 + 15));
  } else if (scoreGap > 15 && matchScore > 30) {
    confidence = Math.min(60, Math.round(matchScore * 0.6 + 10));
  } else {
    confidence = Math.min(50, Math.round(matchScore * 0.5 + 8));
  }
  
  // 如果使用的是基础模式（无sharp），降低置信度
  if (colorAnalysis && colorAnalysis._isBasicMode) {
    confidence = Math.round(confidence * 0.7);
  }
  
  // 构建颜色分析描述
  let colorDesc = '';
  if (colorAnalysis) {
    const topColors = colorAnalysis.dominantColors.slice(0, 5).map(c => {
      const name = COLOR_NAMES_CN[c.color] || c.color;
      return `${name}(${(c.ratio * 100).toFixed(1)}%)`;
    });
    colorDesc = `图片主要颜色分布: ${topColors.join(', ')}。`;
    if (colorAnalysis.format) colorDesc += `图片格式: ${colorAnalysis.format}，`;
    if (colorAnalysis.width) colorDesc += `尺寸: ${colorAnalysis.width}×${colorAnalysis.height}，`;
    colorDesc += `文件大小: ${Math.round(colorAnalysis.fileSize / 1024)}KB。`;
    if (colorAnalysis._isBasicMode) {
      colorDesc += '\n⚠️ 注意: 当前为基础分析模式（未安装sharp图像库），颜色提取精度有限。';
    }
  }
  
  // 显示前三名候选
  const candidates = colorMatches.slice(0, 3)
    .filter(m => m.score > 0)
    .map(m => `${m.herb.name}(${m.score}分)`)
    .join(' > ');
  
  const analysisMode = colorAnalysis?._isBasicMode ? '基础颜色分析' : '像素级颜色特征分析';
  
  const result = {
    ...herb,
    confidence: confidence.toFixed(1),
    aiAnalysis: colorDesc +
      `【当前为${analysisMode}+知识库匹配模式】` +
      `候选排名: ${candidates}。` +
      '本模式通过分析图片的颜色分布特征来辅助判断药材种类，准确度有限。' +
      '如需获得真正的高精度AI视觉识别，请配置以下任一AI服务：\n' +
      '1. 云端API（最高精度）：设置环境变量 OPENAI_API_KEY 或 QWEN_API_KEY 或 DEEPSEEK_API_KEY\n' +
      '   示例: set OPENAI_API_KEY=sk-xxxxx\n' +
      '2. 本地Ollama：访问 https://ollama.com 下载安装，然后运行 ollama pull llava\n' +
      '3. 安装sharp提升本地分析精度: npm install sharp\n' +
      '配置完成后重启本服务器即可启用AI精准识别。',
    _source: 'color-analysis',
    _duration: Date.now() - startTime
  };
  
  return result;
}

// ===================== HTTP 服务 =====================

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const server = http.createServer(async (req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 健康检查
  if (req.url === '/health') {
    const cloudAPI = getAvailableCloudAPI();
    const mode = cloudAPI ? `cloud-${cloudAPI.name}` : 'color-analysis';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      version: '5.0', 
      mode,
      cloudAPI: cloudAPI ? cloudAPI.name : null,
      sharpAvailable: !!sharp,
      availableModes: {
        cloud: !!cloudAPI,
        ollama: false,
        lmstudio: false,
        colorAnalysis: true,
        colorAnalysisPrecision: !!sharp ? 'pixel-level' : 'basic'
      }
    }));
    return;
  }

  // AI鉴定接口
  if (req.url === '/api/identify' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body.toString());

      if (!data.image) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '未提供图片数据' }));
        return;
      }

      console.log('[灵草鉴] 收到鉴定请求，图片大小:', Math.round(data.image.length / 1024), 'KB');
      const result = await identifyHerb(data.image);
      console.log('[灵草鉴] 鉴定完成:', result.name, '置信度:', result.confidence + '%', '来源:', result._source, '耗时:', result._duration + 'ms');

      // 清除内部字段
      const cleanResult = { ...result };
      delete cleanResult._source;
      delete cleanResult._duration;
      delete cleanResult.colorProfile;
      delete cleanResult.shapeHint;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cleanResult));
    } catch (err) {
      console.error('[灵草鉴] 鉴定错误:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '鉴定过程出错: ' + err.message }));
    }
    return;
  }

  // 外部AI写入识别结果的接口
  if (req.url === '/api/submit-result' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body.toString());
      if (data.timestamp) {
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const resultPath = path.join(tempDir, `herb_${data.timestamp}_result.json`);
        fs.writeFileSync(resultPath, JSON.stringify(data.result || {}));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing timestamp' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API配置查询接口
  if (req.url === '/api/config' && req.method === 'GET') {
    const cloudAPI = getAvailableCloudAPI();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      currentMode: cloudAPI ? `cloud-${cloudAPI.name}` : 'color-analysis',
      cloudAPIAvailable: !!cloudAPI,
      ollamaAvailable: false,
      lmstudioAvailable: false,
      sharpAvailable: !!sharp,
      colorAnalysisPrecision: !!sharp ? 'pixel-level' : 'basic',
      setupGuide: {
        cloudAPI: '设置环境变量 OPENAI_API_KEY / QWEN_API_KEY / DEEPSEEK_API_KEY 即可启用云端AI识别',
        ollama: '访问 https://ollama.com 下载安装，运行 ollama pull llava',
        lmstudio: '下载 LM Studio 并启动视觉模型服务',
        sharp: '运行 npm install sharp 提升颜色分析精度（像素级解码）'
      }
    }));
    return;
  }

  // 静态文件服务
  let filePath = req.url === '/' ? '/index.html' : req.url;
  // 处理查询参数
  filePath = filePath.split('?')[0];
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);
  const types = { 
    '.html': 'text/html; charset=utf-8', 
    '.css': 'text/css; charset=utf-8', 
    '.js': 'application/javascript; charset=utf-8', 
    '.png': 'image/png', 
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8'
  };

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  const cloudAPI = getAvailableCloudAPI();
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║    灵草鉴 AI中药鉴定服务器 v5.0                  ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  网站地址: http://localhost:${PORT}                    ║`);
  console.log('║  AI鉴定:  POST /api/identify                    ║');
  console.log('║  健康检查: GET /health                           ║');
  console.log('║  配置查询: GET /api/config                       ║');
  console.log('╠══════════════════════════════════════════════════╣');
  if (cloudAPI) {
    console.log(`║  当前模式: ★ 云端AI (${cloudAPI.name}) - 高精度识别  ║`);
  } else if (sharp) {
    console.log('║  当前模式: ◉ 像素级颜色分析+知识库匹配 - 增强模式  ║');
  } else {
    console.log('║  当前模式: ☆ 颜色特征分析+知识库匹配 - 基础模式  ║');
  }
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  升级到AI精准识别（任选一种）:                     ║');
  console.log('║  1. 云端API: set OPENAI_API_KEY=sk-xxxxx        ║');
  console.log('║     或 set QWEN_API_KEY=sk-xxxxx                ║');
  console.log('║     或 set DEEPSEEK_API_KEY=sk-xxxxx            ║');
  console.log('║  2. 本地Ollama: https://ollama.com               ║');
  console.log('║     安装后运行: ollama pull llava                 ║');
  console.log('║  3. 本地LM Studio: 启动视觉模型服务               ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});
