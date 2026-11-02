import type { ReactNode } from 'react';
import {
  LuActivity, LuArrowDownLeft, LuArrowLeft, LuArrowRight, LuArrowUpRight, LuBell, LuBot, LuBox, LuCheck, LuChevronDown,
  LuChevronRight, LuChartArea, LuChartColumn, LuChartLine, LuCircleAlert, LuCircleCheck, LuCircleDashed, LuCircleDot,
  LuCloudSun, LuCog, LuCopy, LuCpu, LuDisc, LuDownload, LuEllipsis, LuExternalLink, LuEye, LuFileJson, LuFlame,
  LuFolderOpen, LuGauge, LuGraduationCap, LuGripVertical, LuHash, LuHeading, LuHouse, LuInfo, LuLayers, LuLayoutDashboard,
  LuLightbulb, LuLink, LuListChecks, LuLock, LuMessageSquare, LuMonitor, LuMousePointerClick, LuPalette, LuPause,
  LuPencil, LuPlay, LuPlug, LuPlus, LuRadio, LuRedo2, LuRefreshCw, LuRotateCw, LuScrollText, LuSearch,
  LuSeparatorHorizontal, LuServer, LuSettings, LuSlidersHorizontal, LuSparkles, LuSprout, LuSun, LuTable, LuTerminal,
  LuThermometer, LuToggleRight, LuTrash2, LuTriangleAlert, LuType, LuUndo2, LuUpload, LuUser, LuWaves, LuWifi,
  LuWifiOff, LuX, LuZap, LuPanelLeft, LuPanelRight, LuHourglass, LuSquarePlus, LuLogOut,
  LuCoins, LuCrown, LuKeyRound, LuTicket, LuUsers, LuShieldCheck, LuHand, LuLayoutList, LuCylinder, LuGift, LuCopyCheck,
} from 'react-icons/lu';

const ICONS = {
  LuActivity, LuArrowDownLeft, LuArrowLeft, LuArrowRight, LuArrowUpRight, LuBell, LuBot, LuBox, LuCheck, LuChevronDown,
  LuChevronRight, LuChartArea, LuChartColumn, LuChartLine, LuCircleAlert, LuCircleCheck, LuCircleDashed, LuCircleDot,
  LuCloudSun, LuCog, LuCopy, LuCpu, LuDisc, LuDownload, LuEllipsis, LuExternalLink, LuEye, LuFileJson, LuFlame,
  LuFolderOpen, LuGauge, LuGraduationCap, LuGripVertical, LuHash, LuHeading, LuHouse, LuInfo, LuLayers, LuLayoutDashboard,
  LuLightbulb, LuLink, LuListChecks, LuLock, LuMessageSquare, LuMonitor, LuMousePointerClick, LuPalette, LuPause,
  LuPencil, LuPlay, LuPlug, LuPlus, LuRadio, LuRedo2, LuRefreshCw, LuRotateCw, LuScrollText, LuSearch,
  LuSeparatorHorizontal, LuServer, LuSettings, LuSlidersHorizontal, LuSparkles, LuSprout, LuSun, LuTable, LuTerminal,
  LuThermometer, LuToggleRight, LuTrash2, LuTriangleAlert, LuType, LuUndo2, LuUpload, LuUser, LuWaves, LuWifi,
  LuWifiOff, LuX, LuZap, LuPanelLeft, LuPanelRight, LuHourglass, LuSquarePlus, LuLogOut,
  LuCoins, LuCrown, LuKeyRound, LuTicket, LuUsers, LuShieldCheck, LuHand, LuLayoutList, LuCylinder, LuGift, LuCopyCheck,
};

export type IconName = keyof typeof ICONS;

/** Icons a project can use as its visual identity. */
export const PROJECT_ICONS: IconName[] = [
  'LuHouse', 'LuCloudSun', 'LuSprout', 'LuLightbulb', 'LuCog', 'LuBot', 'LuThermometer', 'LuZap', 'LuWaves', 'LuGraduationCap', 'LuSun', 'LuFlame',
];

export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const C = ((ICONS as Record<string, unknown>)[name] ?? LuBox) as (p: { size?: number; className?: string; 'aria-hidden'?: 'true' }) => ReactNode;
  return <C size={size} className={className} aria-hidden="true" />;
}
