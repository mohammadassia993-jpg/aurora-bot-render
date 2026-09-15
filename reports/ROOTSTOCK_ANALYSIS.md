# ROOTSTOCK_ANALYSIS.md — تحليل RootstockLabs (Flyover Bridge)
**التاريخ:** 2026-09-15
**الحالة:** ✅ تحليل مكتمل
**المكافأة:** $200,000 max

## البروتوكول
Flyover — bridge بين Bitcoin و RSK (peg-in/peg-out)

## العقود المفحوصة
1. CollateralManagementContract.sol (4225 سطر)
2. SignatureValidator.sol
3. Quotes.sol (PegIn/PegOut structs)
4. Bridge.sol (interface)

## الثغرات المكتشفة

### 1. Missing Quote Validation in slashCollateral (Medium)
**الموقع:** `slashPegInCollateral`, `slashPegOutCollateral`

```solidity
function slashPegInCollateral(
    address punisher,
    Quotes.PegInQuote calldata quote,
    bytes32 quoteHash
) external onlyRole(COLLATERAL_SLASHER) {
    uint256 penalty = Math.min(
        quote.penaltyFee,  // ← لا تحقق!
        _pegInCollateral[quote.liquidityProviderRskAddress]
    );
```

**المشكلة:** لا يوجد تحقق من:
- صحة quoteHash (هل يتوافق مع quote؟)
- أن quote لم يُستخدم من قبل
- أن quote صالح فعلاً (expiration, signatures)

**الأثر:** COLLATERAL_SLASHER المخترق يمكنه خصم أي مبلغ من LPs

### 2. No Active Orders Check in withdrawCollateral (Low)
```solidity
function _withdrawCollateralTo(address payable to) private {
    uint256 amount = _pegOutCollateral[providerAddress] + _pegInCollateral[providerAddress];
    // لا يوجد تحقق من orders نشطة!
    _pegOutCollateral[providerAddress] = 0;
    _pegInCollateral[providerAddress] = 0;
```

**المشكلة:** LP بعد الاستقالة يمكنه سحب الكفالة حتى مع orders معلقة
**الأثر:** المستخدمون يفقدون حماية الكفالة

## ملخص الأدوات
| الأداة | النتيجة |
|--------|---------|
| Manual Analysis | ✅ 2 ثغرة |
| MIESC (quick) | 0 (أدوات غير مهيأة) |
