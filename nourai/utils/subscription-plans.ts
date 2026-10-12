/** Only sell the exact billing period the person selected. */
export function selectSubscriptionPackage<T extends {
  packageType: string;
  product: { subscriptionPeriod: string | null };
}>(packages: readonly T[], period: 'annual' | 'monthly'): T | undefined {
  const expectedType = period === 'annual' ? 'ANNUAL' : 'MONTHLY';
  const expectedPeriod = period === 'annual' ? 'P1Y' : 'P1M';
  return packages.find((item) =>
    item.packageType === expectedType && item.product.subscriptionPeriod === expectedPeriod
  );
}
