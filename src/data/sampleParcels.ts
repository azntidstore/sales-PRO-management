import { Parcel, Vertex } from "../types";
import {
  calculatePolygonArea,
  calculatePolygonPerimeter,
  buildSegmentsAndStats,
} from "../utils/gisUtils";

function createParcel(
  id: string,
  name: string,
  basicVertices: { x: number; y: number }[],
  neighbors: Record<number, string>,
  attributes?: Record<string, string>
): Parcel {
  const vertices: Vertex[] = basicVertices.map((v, i) => ({
    id: i + 1,
    label: `P${i + 1}`,
    x: v.x,
    y: v.y,
  }));

  const area = calculatePolygonArea(vertices);
  const perimeter = calculatePolygonPerimeter(vertices);
  const segments = buildSegmentsAndStats(vertices, neighbors);

  return {
    id,
    name,
    vertices,
    segments,
    area,
    perimeter,
    attributes: attributes || {
      ID: id,
      Nom: name,
      Source: "Défaut d'usine"
    }
  };
}

export const sampleParcels: Parcel[] = [
  createParcel(
    "parcelle-par-defaut",
    "المضلع الافتراضي (EPSG:26191)",
    [
      { x: 397802.07, y: 197955.56 },
      { x: 397751.30, y: 197635.59 },
      { x: 396966.90, y: 197636.75 },
      { x: 397029.33, y: 197956.59 },
    ],
    {
      1: "abdellah ben ali",
      2: "hassan ouazzani",
      3: "fatna takkal",
      4: "ahmed zidane",
    },
    {
      ID: "DEF-26191",
      Nom: "المضلع الافتراضي (EPSG:26191)",
      Titre: "Default EPSG:26191",
      Zone: "Zone Nord Maroc",
      CRS: "EPSG:26191"
    }
  ),
  createParcel(
    "titre-almarj",
    "Titre Foncier N° 98124/H (Al-Marj)",
    [
      { x: 361100, y: 412400 },
      { x: 361250, y: 412420 },
      { x: 361230, y: 412530 },
      { x: 361120, y: 412510 },
    ],
    {
      1: "Route Principale R301 (Goudronnée)",
      2: "Propriété du sieur Hammou Ben Ali",
      3: "Bien Habous Islamique (Lot N° 3)",
      4: "Propriété privée Consorts El-Idrissi",
    },
    {
      ID: "98124/H",
      Nom: "Titre Foncier N° 98124/H (Al-Marj)",
      Titre: "TFX-98124",
      Municipalite: "Al-Marj Douar",
      Proprietaire: "A. El Idrissi"
    }
  ),
  createParcel(
    "lotissement-alandalous",
    "Lotissement Al-Andalous, Lot N° 14",
    [
      { x: 360210.35, y: 410410.20 },
      { x: 360235.80, y: 410412.50 },
      { x: 360240.10, y: 410435.60 },
      { x: 360225.40, y: 410440.85 },
      { x: 360205.15, y: 410425.40 },
    ],
    {
      1: "Voie publique d'aménagement de 12 m",
      2: "Villa Lot N° 15 (M. Benjeloun)",
      3: "Propriété publique de la Commune",
      4: "Villa Lot N° 13 (Mme. Alaoui)",
      5: "Impasse et servitude de passage",
    },
    {
      ID: "Lot-14",
      Nom: "Lotissement Al-Andalous, Lot N° 14",
      Titre: "Titre N° 45199/Z",
      Zone: "Secteur Villa",
      Architecte: "Bensouda"
    }
  ),
  createParcel(
    "domaine-atlas",
    "Exploitation Agricole (Bled Atlas)",
    [
      { x: 362450.0, y: 414200.0 },
      { x: 362750.0, y: 414220.0 },
      { x: 362790.0, y: 414480.0 },
      { x: 362620.0, y: 414590.0 },
      { x: 362380.0, y: 414450.0 },
      { x: 362410.0, y: 414310.0 },
    ],
    {
      1: "Route Nationale RN9",
      2: "Oued El-Makhazine (Domaine Public Hydraulique)",
      3: "Forêt Domaniale de Maâmora",
      4: "Terre Collective Souala",
      5: "Propriété privée de la coopérative Al-Fath",
      6: "Chemin d'exploitation agricole (Piste)",
    },
    {
      ID: "Bled-Atlas-09",
      Nom: "Exploitation Agricole (Bled Atlas)",
      Titre: "Melk Privé Sec",
      SuperficieCanevas: "2.4 Hectares",
      Exploitant: "Coopérative Al-Fath"
    }
  ),
];
