/**
 * Single source of truth for every photograph on the public site.
 * Files live in /public/images and are served through next/image.
 * Source: Unsplash (free licence, https://unsplash.com/license).
 * TODO: verify photographer names for each photo and fill `credit`; Unsplash asks
 * (but does not require) attribution. The /credits page renders this list.
 */
export interface SiteImage {
  src: string;
  width: number;
  height: number;
  alt: string;
  source: string; // original CDN photo id URL
  credit: string; // photographer; "TODO: verify" until confirmed
}

const U = (id: string) => `https://unsplash.com/photos/${id}`; // TODO: verify page slug
const TODO = "Photographer to be confirmed (TODO: verify)";

export const images = {
  hero: {
    src: "/images/hero-thali.jpg", width: 2000, height: 1127,
    alt: "A steel thali of dal, curry and fresh flatbread on a dark wooden table",
    source: U("photo-1567337710282-00832b415979"), credit: TODO,
  },
  diningHall: {
    src: "/images/dining-hall.jpg", width: 1400, height: 1050,
    alt: "A bright, high-ceilinged dining space with wooden tables and large windows",
    source: U("photo-1555396273-367ea4eb4db5"), credit: TODO,
  },
  hallInterior: {
    src: "/images/hall-interior.jpg", width: 1400, height: 933,
    alt: "Rows of tables and chairs in a large, tidy dining hall",
    source: U("photo-1517248135467-4c7edcad34c4"), credit: TODO,
  },
  freshProduce: {
    src: "/images/fresh-produce.jpg", width: 1400, height: 933,
    alt: "Trays of fresh vegetables, pulses and salad ingredients laid out in rows",
    source: U("photo-1498837167922-ddd27525d352"), credit: TODO,
  },
  wellnessBowl: {
    src: "/images/wellness-bowl.jpg", width: 1400, height: 933,
    alt: "A colourful bowl of salad with avocado, chickpeas and sweet potato",
    source: U("photo-1512621776951-a57141f2eefd"), credit: TODO,
  },
  grabGo: {
    src: "/images/grab-go.jpg", width: 1400, height: 799,
    alt: "Grilled paneer pieces with herbs served on a hot plate",
    source: U("photo-1567188040759-fb8a883dc6d8"), credit: TODO,
  },
  biryani: {
    src: "/images/biryani.jpg", width: 1400, height: 2100,
    alt: "A plate of fragrant biryani garnished with herbs and lime",
    source: U("photo-1589302168068-964664d93dc0"), credit: TODO,
  },
  pavBhaji: {
    src: "/images/pav-bhaji.jpg", width: 1400, height: 1126,
    alt: "Buttered pav buns served with a bowl of spiced bhaji",
    source: U("photo-1606491956689-2ea866880c84"), credit: TODO,
  },
} satisfies Record<string, SiteImage>;
