export const portalLocales = {
  en: {
    hub: {
      title: 'QMS Portal',
      subtitle: 'Quality Management System Portal',
      open: 'Open',
      comingSoon: 'Coming Soon'
    }
  },
  th: {
    hub: {
      title: 'QMS Portal',
      subtitle: 'ระบบบริหารจัดการคุณภาพ (Quality Management System)',
      open: 'เปิดใช้งาน',
      comingSoon: 'เร็วๆ นี้'
    }
  }
};

export function usePortalTranslation() {
  const currentLang = localStorage.getItem('language') || 'th';
  
  const t = (namespace, key) => {
    try {
      return portalLocales[currentLang]?.[namespace]?.[key] || key;
    } catch {
      return key;
    }
  };

  return { t, currentLang };
}
