type OBFeatureProvisionSchemaType = {
  defaultForBranches: {
    [featureName: string]: boolean;
  };
  branchOverrides: {
    [branch_jobLevel: string]: {
      [featureName: string]: boolean;
    };
  };
};

export { OBFeatureProvisionSchemaType };
