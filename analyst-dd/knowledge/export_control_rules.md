# 出口管制 / 军民两用要点 (Export Control Rules)

> hardtech-dd subagent 在做出口管制初筛时引用。
> 注意：此文件仅供初步筛查参考，不替代专业法律意见。

## 核心法规框架

### 美国 (BIS - Bureau of Industry and Security)
- **EAR** (Export Administration Regulations): 管控范围最广
- **Entity List**: 受限实体清单，交易需许可证
- **ECCN** (Export Control Classification Number): 物项分类编码
- **FDPR** (Foreign Direct Product Rule): 使用美国技术/设备生产的产品也受管控

### 中国
- **出口管制法** (2020.12.01 施行)
- **两用物项出口管制清单**
- **不可靠实体清单**
- **数据出境安全评估**

### 多边机制
- **瓦森纳协定** (Wassenaar Arrangement): 常规武器及两用物项
- **核供应国集团** (NSG)
- **导弹技术控制制度** (MTCR)

## 半导体相关管控重点

### 受限制程/技术 (截至文件更新日期)
- 先进逻辑芯片：≤ 14nm FinFET / ≤ 16nm
- 先进存储：128 层以上 NAND / 18nm 以下 DRAM
- EDA 工具：GAA 相关设计工具
- 半导体设备：EUV 光刻机、先进沉积/刻蚀设备

### 高风险场景
- [ ] 目标公司产品是否使用受限制程？
- [ ] 供应链是否依赖受限设备（ASML EUV、LAM、AMAT）？
- [ ] 终端客户是否包含 Entity List 实体？
- [ ] 公司创始人/高管是否有敏感背景？

## 核聚变相关管控

- 超导材料（特别是高温超导带材）可能涉及两用物项
- 等离子体加热技术与武器开发存在交叉
- 氚处理和中子源技术受核不扩散管控
- [ ] 检查公司是否涉及受控核材料或技术

## 火箭/航天相关管控

- 运载火箭技术几乎全部属于 MTCR 管控范畴
- 惯性导航、推进系统、再入技术均为敏感项
- 中国商业航天公司出口受限
- [ ] 检查公司技术是否属于 MTCR Category I

## DD 初筛流程

1. **识别公司核心技术** → 映射到 ECCN 编码
2. **检查 Entity List** → 公司及关联方是否在册
3. **评估 FDPR 影响** → 供应链中是否使用美国原产技术/设备
4. **交叉检查军民两用** → 技术是否有明确军事应用
5. **标记风险等级**：
   - 绿色：无明显管控风险
   - 黄色：存在灰色地带，建议法律咨询
   - 红色：明确受限，投资需极度谨慎

## 常用查询资源

- BIS Entity List: https://www.bis.doc.gov/index.php/policy-guidance/lists-of-parties-of-concern
- ECCN Search: https://www.bis.doc.gov/index.php/licensing/commerce-control-list-classification
- 中国出口管制信息网: http://exportcontrol.mofcom.gov.cn/

---

_法规更新频繁，本文件应至少每季度核查一次。标注最后更新日期。_

**最后更新**: [YYYY-MM-DD]
