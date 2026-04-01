export function createProductManageState() {
  return {
    currentProfile: null,
    allProducts: [],
    lastSelectedProductCode: '',
    mode: 'create'
  };
}
