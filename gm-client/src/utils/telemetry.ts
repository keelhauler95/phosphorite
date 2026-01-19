import { NumericalParameter, TextualParameter } from '../types';

export type ParameterStatus = 'nominal' | 'warning' | 'alarm';

const isNumericalParameter = (param: NumericalParameter | TextualParameter): param is NumericalParameter => {
  return (param as NumericalParameter).targetValue !== undefined;
};

export const getParameterStatus = (parameter: NumericalParameter | TextualParameter): ParameterStatus => {
  if (!isNumericalParameter(parameter)) {
    const current = typeof parameter.value === 'string' ? parameter.value : `${parameter.value ?? ''}`;
    const expected = typeof parameter.expectedValue === 'string' ? parameter.expectedValue : `${parameter.expectedValue ?? ''}`;
    return current === expected ? 'nominal' : 'alarm';
  }

  const value = typeof parameter.value === 'number' ? parameter.value : Number(parameter.value);
  if (!isFinite(value)) {
    return 'nominal';
  }

  if (value <= parameter.criticalLower || value >= parameter.criticalUpper) {
    return 'alarm';
  }

  if (value <= parameter.warningLower || value >= parameter.warningUpper) {
    return 'warning';
  }

  return 'nominal';
};

export interface ParameterStatusCounts {
  nominal: number;
  warning: number;
  alarm: number;
}

export const getStatusCounts = (parameters: Array<NumericalParameter | TextualParameter>): ParameterStatusCounts => {
  return parameters.reduce<ParameterStatusCounts>((acc, param) => {
    const status = getParameterStatus(param);
    acc[status] += 1;
    return acc;
  }, { nominal: 0, warning: 0, alarm: 0 });
};

export const getDominantStatus = (counts: ParameterStatusCounts): ParameterStatus => {
  if (counts.alarm > 0) return 'alarm';
  if (counts.warning > 0) return 'warning';
  return 'nominal';
};
