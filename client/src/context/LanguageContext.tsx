import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'so' | 'en';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

export const translations: Record<Language, Record<string, string>> = {
  so: {
    // Top banner & Header
    'nav.freeDelivery': 'Gaarsiin lacag la’aan ah dalabyada ka badan',
    'nav.welcome': 'Ku soo dhawoow HILAAL Shop',
    'nav.trackOrder': 'La soco dalabka',
    'nav.shop': 'Dukaanka',
    'nav.newArrivals': 'Kuwa Cusub',
    'nav.offers': 'Qiimo Dhimis',
    'nav.about': 'Ku Saabsan',
    'nav.contact': 'Nala Xiriir',
    'nav.categories': 'Qaybaha',
    'nav.search': 'Raadi',
    'nav.searchPlaceholder': 'Raadi badeecooyinka, noocyada iyo qaybaha…',
    'nav.searchDrawer': 'Raadi dukaanka',
    'nav.cart': 'Gaariga',
    'nav.wishlist': 'Kuwa la jecelyahay',
    'nav.myAccount': 'Koontadayda',
    'nav.myOrders': 'Dalabyadayda',
    'nav.admin': 'Xafiiska Maamulka',
    'nav.signIn': 'Gal (Sign in)',
    'nav.register': 'Sameyso Koonto',
    'nav.signOut': 'Ka bax (Sign out)',
    'nav.staffSignIn': 'Gelitaanka Shaqaalaha',
    'nav.themeLight': 'Iftiinka cad',
    'nav.themeDark': 'Iftiinka madow',
    'nav.language': 'Luqadda',
    'nav.somali': 'Soomaali',
    'nav.english': 'English',

    // Hero Section
    'hero.badge': 'Heerka Tayada HILAAL',
    'hero.title': 'Baahiyahaaga maalinlaha ah, oo tayo sare leh.',
    'hero.subtitle': 'Dukaan casri ah oo loogu talagalay noloshaada — raashin tayo leh, agabka guriga iyo baahiyaha maalinlaha ah, oo si hufan laguu soo gaarsiinayo.',
    'hero.cta': 'Dukaamayso Hadda',
    'hero.secondary': 'Sheekadeenna',
    'hero.inStock': 'badeecooyin kaydka ku jira',
    'hero.curatedCategories': 'qaybood oo la xushay',
    'hero.reviews': 'faallooyin',
    'hero.sameDayDelivery': 'Gaarsiin isla maalintaas',
    'hero.onLocalOrders': 'dalabyada magaalada',
    'hero.readyOnShelves': 'oo diyaar ku ah khaanadaha',
    'hero.brandSlogan': 'Kayd dhab ah. Qiimo xalaal ah.',

    // Trust strip
    'trust.freeDelivery.title': 'Gaarsiin bilaash ah',
    'trust.freeDelivery.copy': 'Dalabyada shuruudda buuxiya',
    'trust.verification.title': 'Xaqiijin toos ah',
    'trust.verification.copy': 'Lacag-bixin kasta oo moobil ah waa la hubiyaa',
    'trust.payment.title': 'Habka aad rabto ku bixi',
    'trust.payment.copy': 'Kaash ama lacagta moobaylka (EVC, ZAAD, Sahal)',
    'trust.support.title': 'Taageero dhab ah',
    'trust.support.copy': 'Koox mar kasta diyaar kuu ah',

    // Home sections
    'section.browse': 'Baadh dukaanka',
    'section.everything': 'Wax kasta oo nolosha maalinlaha ah',
    'section.everythingDesc': 'Laga bilaabo cuntada ilaa agabka guriga — si fudud oo habaysan ku hel.',
    'section.viewAll': 'Dhammaan badeecooyinka',
    'section.justIn': 'Hadda soo degay',
    'section.newArrivals': 'Kuwa cusub',
    'section.newArrivalsDesc': 'Alaab cusub oo hadda khaanadaha dukaanka soo gaadhay.',
    'section.seeNew': 'Eeg kuwa cusub',
    'section.bestSellers': 'Kuwa loogu jecelyahay',
    'section.bestSellersTitle': 'Kuwa loogu iibsiga badan yahay',
    'section.bestSellersDesc': 'Badeecooyinka ay macaamiisheennu aadka u jecel yihiin.',
    'section.shopBestSellers': 'Iibso kuwa loogu jecelyahay',
    'section.onOffer': 'Qiimo dhimis hadda socota',
    'section.onOfferTitle': 'Qiimo dhimis gaar ah',
    'section.onOfferDesc': 'Qiimo jaban oo ku socda badeecooyinka xilligan — inta ay weli yaallaan.',
    'section.allOffers': 'Dhammaan qiimo dhimista',
    'section.recommended': 'Kuu gaar ah',
    'section.recommendedTitle': 'Waxaa kaloo laga yaabaa inaad ka hesho',
    'section.recommendedDesc': 'Xulasho kooban oo laga soo xushay qaybaha dukaanka.',
    'section.exploreAll': 'Baadh wax kasta',
    'section.reviewsEyebrow': 'Erayo dhab ah',
    'section.reviewsTitle': 'Waxa ay macaamiisheennu yiraahdeen',
    'section.reviewsDesc': 'Faallooyin ka yimid macaamiil dhab ah oo wax naga iibsaday.',
    'section.stayClose': 'Nala soco mar walba',
    'section.stayCloseTitle': 'Warar iyo qiimo dhimis joogto ah.',
    'section.stayCloseDesc': 'Badeecooyin cusub, qiimo dhimis dhab ah iyo wararka dukaanka. Wax dhib ah ma laha.',
    'section.subscribe': 'Is-qor',
    'section.emailPlaceholder': 'Geli ciwaankaaga iimaylka',

    // Product Card & Details
    'product.featured': 'La xushay',
    'product.soldOut': 'Wuu dhammaaday',
    'product.inStock': 'Wuu yaallaa kaydka',
    'product.quickView': 'Fiiri degdeg',
    'product.addToCart': 'Ku dar gaariga',
    'product.viewDetails': 'Faahfaahin buuxda',
    'product.chooseOption': 'Dooro nooca',
    'product.per': 'halkii',
    'product.reviews': 'faallooyin',

    // Cart
    'cart.title': 'Gaarigaaga',
    'cart.emptyTitle': 'Gaarigaagu waa maran yahay',
    'cart.emptyDesc': 'Baadh dukaanka oo ku darso alaabta aad u baahan tahay.',
    'cart.startShopping': 'Bilow Dukaamaysiga',
    'cart.summary': 'Koobidda Dalabka',
    'cart.subtotal': 'Wadarta badeecada',
    'cart.delivery': 'Gaarsiinta',
    'cart.free': 'Bilaash',
    'cart.tax': 'Canshuur',
    'cart.total': 'Wadarta Guud',
    'cart.proceed': 'U gudub bixinta',
    'cart.continue': 'Sii wad dukaamaysiga',
    'cart.spendMore': 'Kudarso {amount} oo dheeraad ah si aad u hesho gaarsiin bilaash ah.',

    // Checkout
    'checkout.title': 'Dhameystirka Dalabka',
    'checkout.details': 'Faahfaahinta Gaarsiinta',
    'checkout.fullName': 'Magacaaga oo buuxa',
    'checkout.phone': 'Lambarka taleefanka',
    'checkout.city': 'Magaalada / Degmada',
    'checkout.address': 'Cinwaanka guri/xaafadda',
    'checkout.notes': 'Faallooyin dheeraad ah (ikhtiyaari)',
    'checkout.guestEmail': 'Iimaylkaaga (ikhtiyaari)',
    'checkout.paymentMethod': 'Habka Lacag Bixinta',
    'checkout.placeOrder': 'Xaqiiji Dalabka',
    'checkout.placing': 'Dalabka waa la dirayaa…',
    'checkout.success': 'Hambalyo! Dalabkaagii waa la xaqiijiyay.',
    'checkout.orderNum': 'Lambarka dalabkaaga waa',
    'checkout.cashDelivery': 'Lacag bixinta marka laguu keeno (Cash on Delivery)',
    'checkout.mobileMoney': 'Lacagta Moobaylka (EVC Plus, ZAAD, Sahal, eDahab)',

    // Order Track
    'track.title': 'La Soco Dalabkaaga',
    'track.subtitle': 'Geli lambarka dalabkaaga si aad u ogaato xaaladdiisa.',
    'track.orderNumber': 'Lambarka Dalabka',
    'track.button': 'Raadi Xaaladda',

    // Account & Auth
    'auth.login': 'Soo Gal',
    'auth.register': 'Sameyso Akoon',
    'auth.email': 'Iimaylka',
    'auth.password': 'Furaha sirta ah',
    'auth.name': 'Magacaaga',
    'auth.forgotPassword': 'Ma ilowday furaha sirta?',
    'account.myProfile': 'Xogtayda Gaarka ah',
    'account.orders': 'Dalabyadayda',
    'account.wishlist': 'Waxyaabaha aan Jeclahay',

    // Footer
    'footer.description': 'Dukaamayso si caqliyeysan. Maamul si wanaagsan. Kobac si degdeg ah. Waxyaabaha maalinlaha ah ee dukaankaaga oo lagu maamulo kayd toos ah, qiimo daacad ah iyo daryeelka dalab kasta.',
    'footer.shop': 'Dukaanka',
    'footer.help': 'Caawinaad',
    'footer.stayInLoop': 'La soco xaaladda',
    'footer.newsletterCopy': 'Kuwa cusub, qiimo dhimis iyo wararka dukaanka. Wax dhib ah kuma laha.',
    'footer.rights': 'Xuquuqda oo dhan way dhowran tahay.',
  },
  en: {
    // Top banner & Header
    'nav.freeDelivery': 'Free delivery on orders over',
    'nav.welcome': 'Welcome to HILAAL',
    'nav.trackOrder': 'Track order',
    'nav.shop': 'Shop',
    'nav.newArrivals': 'New arrivals',
    'nav.offers': 'Offers',
    'nav.about': 'About',
    'nav.contact': 'Contact',
    'nav.categories': 'Categories',
    'nav.search': 'Search',
    'nav.searchPlaceholder': 'Search products, brands and categories…',
    'nav.searchDrawer': 'Search the shop',
    'nav.cart': 'Cart',
    'nav.wishlist': 'Wishlist',
    'nav.myAccount': 'My account',
    'nav.myOrders': 'My orders',
    'nav.admin': 'Admin workspace',
    'nav.signIn': 'Sign in',
    'nav.register': 'Create account',
    'nav.signOut': 'Sign out',
    'nav.staffSignIn': 'Staff sign in',
    'nav.themeLight': 'Light theme',
    'nav.themeDark': 'Dark theme',
    'nav.language': 'Language',
    'nav.somali': 'Soomaali',
    'nav.english': 'English',

    // Hero Section
    'hero.badge': 'The HILAAL standard',
    'hero.title': 'Everyday essentials, elevated.',
    'hero.subtitle': 'A modern general shop for the way you live — curated groceries, home goods and daily essentials, delivered with care.',
    'hero.cta': 'Shop the collection',
    'hero.secondary': 'Our story',
    'hero.inStock': 'products in stock',
    'hero.curatedCategories': 'curated categories',
    'hero.reviews': 'reviews',
    'hero.sameDayDelivery': 'Same-day delivery',
    'hero.onLocalOrders': 'on local orders',
    'hero.readyOnShelves': 'ready on our shelves',
    'hero.brandSlogan': 'Real stock. Honest prices.',

    // Trust strip
    'trust.freeDelivery.title': 'Free delivery',
    'trust.freeDelivery.copy': 'On qualifying orders',
    'trust.verification.title': 'Manual verification',
    'trust.verification.copy': 'Every mobile payment checked',
    'trust.payment.title': 'Pay your way',
    'trust.payment.copy': 'Cash or mobile money',
    'trust.support.title': 'Real support',
    'trust.support.copy': 'A team that answers',

    // Home sections
    'section.browse': 'Browse the shop',
    'section.everything': 'Everything for the everyday',
    'section.everythingDesc': 'From the pantry to the bathroom shelf — organised so you can find what you need quickly.',
    'section.viewAll': 'All products',
    'section.justIn': 'Just in',
    'section.newArrivals': 'New arrivals',
    'section.newArrivalsDesc': 'Fresh stock, added as it reaches the shelves.',
    'section.seeNew': "See what's new",
    'section.bestSellers': 'Customer favourites',
    'section.bestSellersTitle': 'Best sellers',
    'section.bestSellersDesc': 'The products our customers come back for.',
    'section.shopBestSellers': 'Shop best sellers',
    'section.onOffer': 'Limited-time value',
    'section.onOfferTitle': 'On offer now',
    'section.onOfferDesc': 'Lower prices on real stock — while it lasts.',
    'section.allOffers': 'All offers',
    'section.recommended': 'Picked for you',
    'section.recommendedTitle': 'You might also like',
    'section.recommendedDesc': 'A small selection from across the shop.',
    'section.exploreAll': 'Explore everything',
    'section.reviewsEyebrow': 'Real words',
    'section.reviewsTitle': 'What our customers say',
    'section.reviewsDesc': 'Reviews from verified purchases and everyday shoppers.',
    'section.stayClose': 'Stay close',
    'section.stayCloseTitle': 'Good things, occasionally.',
    'section.stayCloseDesc': 'New arrivals, genuine offers and shop news. We keep it short and useful.',
    'section.subscribe': 'Subscribe',
    'section.emailPlaceholder': 'Your email address',

    // Product Card & Details
    'product.featured': 'Featured',
    'product.soldOut': 'Sold out',
    'product.inStock': 'in stock',
    'product.quickView': 'Quick view',
    'product.addToCart': 'Add to cart',
    'product.viewDetails': 'View full details',
    'product.chooseOption': 'Choose an option',
    'product.per': 'per',
    'product.reviews': 'reviews',

    // Cart
    'cart.title': 'Your cart',
    'cart.emptyTitle': 'Your cart is empty',
    'cart.emptyDesc': 'Browse the shop and add a few everyday essentials to get started.',
    'cart.startShopping': 'Start shopping',
    'cart.summary': 'Order summary',
    'cart.subtotal': 'Subtotal',
    'cart.delivery': 'Delivery',
    'cart.free': 'Free',
    'cart.tax': 'Tax',
    'cart.total': 'Total',
    'cart.proceed': 'Proceed to checkout',
    'cart.continue': 'Continue shopping',
    'cart.spendMore': 'Spend {amount} more for free delivery.',

    // Checkout
    'checkout.title': 'Checkout',
    'checkout.details': 'Delivery details',
    'checkout.fullName': 'Full name',
    'checkout.phone': 'Phone number',
    'checkout.city': 'City / District',
    'checkout.address': 'Address / Neighborhood',
    'checkout.notes': 'Order notes (optional)',
    'checkout.guestEmail': 'Your email (optional)',
    'checkout.paymentMethod': 'Payment method',
    'checkout.placeOrder': 'Place order',
    'checkout.placing': 'Placing order…',
    'checkout.success': 'Thank you! Your order has been placed.',
    'checkout.orderNum': 'Your order number is',
    'checkout.cashDelivery': 'Cash on delivery',
    'checkout.mobileMoney': 'Mobile money (EVC Plus, ZAAD, Sahal, eDahab)',

    // Order Track
    'track.title': 'Track your order',
    'track.subtitle': 'Enter your order number to check status.',
    'track.orderNumber': 'Order number',
    'track.button': 'Track order',

    // Account & Auth
    'auth.login': 'Sign in',
    'auth.register': 'Create account',
    'auth.email': 'Email address',
    'auth.password': 'Password',
    'auth.name': 'Your name',
    'auth.forgotPassword': 'Forgot password?',
    'account.myProfile': 'My profile',
    'account.orders': 'My orders',
    'account.wishlist': 'Wishlist',

    // Footer
    'footer.description': 'Shop Smarter. Manage Better. Grow Faster. Everyday essentials from a shop that runs on real inventory, honest prices and care for every order.',
    'footer.shop': 'Shop',
    'footer.help': 'Help',
    'footer.stayInLoop': 'Stay in the loop',
    'footer.newsletterCopy': 'New arrivals, offers and shop news. No noise.',
    'footer.rights': 'All rights reserved.',
  },
};

const LanguageContext = createContext<LanguageContextType | null>(null);

function initialLanguage(): Language {
  const stored = localStorage.getItem('hilaal_language');
  if (stored === 'so' || stored === 'en') return stored;
  return 'so'; // Default to Somali
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  useEffect(() => {
    localStorage.setItem('hilaal_language', language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const toggleLanguage = () => {
    setLanguageState((prev) => (prev === 'so' ? 'en' : 'so'));
  };

  const t = (key: string, fallback?: string): string => {
    return translations[language]?.[key] ?? fallback ?? translations['en']?.[key] ?? key;
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
