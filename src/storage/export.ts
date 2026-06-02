// ============================================================
// 编排导出/导入
// ============================================================
import type { CompiledSequence, UserPreferences, PhaseOption } from '../types';
import { loadPreferences } from './index';

export interface ExportData {
  version: 1;
  exportedAt: string;
  totalDurationSec: number;
  preferences: UserPreferences;
  phaseConfig: PhaseOption[];
  enabledActions: string[];
  climaxMin: number;
  afterglowMin: number;
  sequence: CompiledSequence;
}

/** 打包导出数据 */
export function buildExportData(
  totalDurationSec: number,
  enabledPhases: PhaseOption[],
  enabledActions: string[],
  climaxMin: number,
  afterglowMin: number,
  sequence: CompiledSequence,
): ExportData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    totalDurationSec,
    preferences: loadPreferences(),
    phaseConfig: enabledPhases,
    enabledActions,
    climaxMin,
    afterglowMin,
    sequence,
  };
}

/** 触发浏览器下载 JSON 文件 */
export function downloadExport(data: ExportData, filename?: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `编排_${data.totalDurationSec}s_${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 从文件读取并解析导入数据 */
export function readImportFile(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.version !== 1) throw new Error('不支持的版本');
        if (!data.sequence?.timeline) throw new Error('无效的编排数据');
        resolve(data as ExportData);
      } catch (e: any) {
        reject(new Error(`解析失败: ${e.message}`));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

/** 从粘贴的文本解析导入 */
export function parseImportText(text: string): ExportData {
  const data = JSON.parse(text);
  if (data.version !== 1) throw new Error('不支持的版本');
  if (!data.sequence?.timeline) throw new Error('无效的编排数据');
  return data as ExportData;
}
