import type { PartView } from '../lib/types'

export function Source({ part }: { part: PartView }) {
  if (part.visual) {
    const { heading, subtitle, columns, rows, note } = part.visual
    return <div className="flyer">
      <div className="flyer-head"><span className="eyebrow">Community notice</span><h2>{heading}</h2><p>{subtitle}</p></div>
      <div className="table-scroll" role="region" aria-label="Flyer schedule" tabIndex={0}>
        <table><thead><tr>{columns.map((cell, i) => <th scope="col" key={i}>{cell}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th scope="row" key={j}>{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="flyer-note">{note}</p>
    </div>
  }
  return <article className="passage"><h2>{part.title}</h2>
    {part.paragraphs.map((text, i) => <div className="paragraph" key={i}>
      {part.index === 2 && <span className="paragraph-label">{'ABCD'[i]}</span>}<p>{text}</p>
    </div>)}
    {part.index === 2 && <p className="e-note"><strong>E</strong> · Information not stated in the passage</p>}
  </article>
}
