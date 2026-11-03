import brand from '../../../shared/brand.json';

export default function BrandSlogan() {
  return <span><span className="sr-only">{brand.plainSlogan}</span><span aria-hidden="true">{brand.slogan}</span></span>;
}
