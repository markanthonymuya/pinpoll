import Image from 'next/image';

interface Props {
  name: string;
  image_url: string | null;
  icon_key: string | null;
  size?: 'large' | 'small';
}

const LETTER_COLORS = [
  'bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-yellow-400',
  'bg-lime-400', 'bg-green-400', 'bg-teal-400', 'bg-cyan-400',
  'bg-blue-400', 'bg-indigo-400', 'bg-violet-400', 'bg-purple-400',
];

function letterColor(name: string): string {
  const idx = (name.charCodeAt(0) || 0) % LETTER_COLORS.length;
  return LETTER_COLORS[idx];
}

export function OptionImage({ name, image_url, icon_key, size = 'large' }: Props) {
  const dim = size === 'large' ? 'w-full aspect-square' : 'w-10 h-10 flex-shrink-0';

  if (image_url) {
    return (
      <div className={`relative ${dim} overflow-hidden rounded-lg`}>
        <Image
          src={image_url}
          alt={name}
          fill
          className="object-cover"
          sizes={size === 'large' ? '(max-width: 768px) 50vw, 25vw' : '40px'}
        />
      </div>
    );
  }

  if (icon_key) {
    return (
      <div className={`${dim} flex items-center justify-center bg-gray-100 rounded-lg`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/icons/${icon_key}.svg`} alt={name} className="w-1/2 h-1/2 object-contain" />
      </div>
    );
  }

  // Letter avatar fallback
  const color = letterColor(name);
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className={`${dim} ${color} flex items-center justify-center rounded-lg`}>
      <span className={`text-white font-bold ${size === 'large' ? 'text-4xl' : 'text-base'}`}>
        {letter}
      </span>
    </div>
  );
}
