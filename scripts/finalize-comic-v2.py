"""Build the finished comic's public assets from reviewed local artwork.

Sol 6.1 on behalf of the owner. No network, credentials or private records.
The explicit source and output arguments keep this reusable on another machine.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def build(art_dir, panels_file, output):
    records = json.loads(panels_file.read_text())
    by_page = {record['page']: record for record in records}
    if len(records) != 15 or set(by_page) != set(range(1, 16)):
        raise ValueError('Exactly fifteen unique story-page records are required')
    sources = [art_dir / ('00-cover.png' if n == 0 else f'{n:02d}.png') for n in range(16)]
    missing = [p.name for p in sources if not p.is_file()]
    if missing:
        raise ValueError(f'Incomplete actual art: {missing}')
    # Validate everything before replacing any selected public asset.
    for n, source in enumerate(sources):
        with Image.open(source) as image:
            image.load()
            if image.size != (1696, 2528):
                raise ValueError(f'Unexpected source geometry for page {n}: {image.size}')
        if n:
            panels = by_page[n]['panels']
            if not panels:
                raise ValueError(f'Missing actual panels on page {n}')
            for panel in panels:
                x0, y0, x1, y1 = panel['box']
                if not (0 <= x0 < x1 <= 1696 and 260 <= y0 < y1 <= 2528):
                    raise ValueError(f'Invalid panel rectangle on page {n}: {panel["box"]}')
                if not isinstance(panel['description'], str) or len(panel['description']) < 10:
                    raise ValueError(f'Missing scene description on page {n}')
                if not isinstance(panel['dialogue'], list) or any(not isinstance(line.get('speaker'), str) or not isinstance(line.get('text'), str) for line in panel['dialogue']):
                    raise ValueError(f'Invalid transcript on page {n}')
    (output / 'pages').mkdir(parents=True, exist_ok=True)
    (output / 'panels').mkdir(exist_ok=True)
    pages, pdf, hashes = [], [], {}
    for n, source in enumerate(sources):
        name = '00-cover' if n == 0 else f'{n:02d}'
        image = Image.open(source).convert('RGB')
        if n:
            # Nano Banana preserves panel geometry but leaves an empty masthead
            # strip. Page 3 alone has intentionally edge-to-edge bottom artwork.
            image = image.crop((0, 267, 1696, 2528) if n == 3 else (94, 267, 1602, 2430))
        image.save(output / 'pages' / f'{name}.webp', quality=94, method=6)
        pdf.append(image)
        entry: dict = {'src': f'pages/{name}.webp', 'label': 'Cover' if n == 0 else f'Story page {n}'}
        if n == 0:
            entry['description'] = 'The Costume, Issue #1. Two Black friends, one in a red cape and teal suit and one in a charcoal hoodie, stand together on a two-tower bridge. A tree grows from an open book behind them; a paper boat floats below. You Got the Alien Right Here. One friendship. One future. Too many messages.'
        else:
            original = Image.open(source).convert('RGB')
            entry['panels'] = []
            for index, panel in enumerate(by_page[n]['panels'], 1):
                src = f'panels/{n:02d}-{index:02d}.webp'
                original.crop(tuple(panel['box'])).save(output / src, quality=94, method=6)
                entry['panels'].append({'src': src, 'description': panel['description'], 'dialogue': panel['dialogue']})
        pages.append(entry)
    pdf[0].save(output / 'issue-01.pdf', save_all=True, append_images=pdf[1:], resolution=160, quality=92)
    issue = {'schema': 'aknewcomic-issue/2', 'title': 'The Costume', 'issue': 1, 'pages': pages, 'pdf': 'issue-01.pdf'}
    (output / 'issue.json').write_text(json.dumps(issue, indent=2, ensure_ascii=False) + '\n')
    for p in sorted(output.rglob('*')):
        if p.is_file():
            hashes[str(p.relative_to(output))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return {'pages': len(pages), 'panels': sum(len(p.get('panels', [])) for p in pages), 'hashes': hashes}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--art-dir', type=Path, required=True)
    parser.add_argument('--panel-file', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    receipt = build(args.art_dir, args.panel_file, args.output)
    args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'pages': receipt['pages'], 'panels': receipt['panels'], 'verified_asset_count': len(receipt['hashes'])}))
